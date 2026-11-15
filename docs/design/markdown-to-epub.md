# Markdown to EPUB

Turn one Markdown note into an EPUB in the vault, with sections cut at a heading level you choose.

One note, a folder as one book, and a folder as one book per note.

---

## Why

It closes a loop the plugin otherwise only runs one way. Orbis already exports a book *out* to Markdown
([Book Export](book-export.md)); this brings your own writing *in*, and once it is an EPUB it gets everything the
reader has — marks, notes, bookmarks, the TOC, search, Listen, recorded audio, and
[reading records](reading-records.md). A long note you wrote becomes a thing you can read on a phone, annotate, and
have read aloud.

It is also the only way to *fix* a book: export it to Markdown, correct the text, convert it back. Lossy, but
possible.

---

## The pipeline

```text
note.md
  ├─ frontmatter ──────────────► metadata (title, author, language, …)
  └─ body
       ├─ MarkdownRenderer ────► Obsidian DOM
       ├─ sanitize ────────────► XHTML fragments
       ├─ split at heading N ──► sections + anchor map
       └─ package ─────────────► mimetype · container.xml · OPF · nav · sectN.xhtml · images
                                                                                    │
                                                                              note.epub
```

---

## Packaging

**The zip writer is `fflate`'s `zipSync`.** Both vendored libraries are decompress-only:
`foliate-js/vendor/fflate.js` exports just `unzlibSync`, and `vendor/zip.js` is a reader build. `fflate` proper is
small, dependency-free and MIT.

**`mimetype` must be the first entry in the archive and stored uncompressed.** `zipSync` preserves key order and
takes a per-file `{ level: 0 }`, so it is expressible — but a reader is entitled to reject an archive that gets this
wrong, possibly including ours.

EPUB 3 with a `nav.xhtml`. No NCX: nothing we care about needs EPUB 2 compatibility, and foliate reads EPUB 3.

---

## Markdown to HTML

**`MarkdownRenderer.render()`, then a sanitizing pass.** A bundled CommonMark parser would produce cleaner HTML but
silently lose callouts, footnotes and math, which are things people actually write in Obsidian. Losing them quietly
is the worst of the available outcomes.

The sanitizing pass is the inverse of `turndown-rules.ts` and does the same kind of work: strip scripts and event
handlers, drop Obsidian-specific classes, close void elements, and serialize as XML rather than HTML, because
XHTML must be well-formed.

Two things to know about this choice:

- It is **async and needs a `Component`** to render into.
- **Plugin-rendered blocks do not resolve in a detached element.** A Dataview query renders to nothing. The
  analysis step reports that rather than letting it be discovered in the finished book.

---

## Metadata

Defaults come from the frontmatter [Book Export](book-export.md) already writes — `title`, `author`, `publisher`,
`language`, `publication_date` — so the two features compose and a round-tripped book keeps its identity.

**The `frontmatterKeyLanguage` setting means those keys may be native or English.** Reading them has to respect
it, or it finds nothing and every field looks empty.

EPUB *requires* three: `dc:identifier`, `dc:title`, `dc:language`.

| Field | Default | Editable |
|---|---|---|
| Title | frontmatter `title`, else the note's basename | yes |
| Author | frontmatter `author`, else empty | yes — an ebook without one is odd |
| Language | frontmatter `language`, else `en` | yes |
| Identifier | a generated UUID | no |

**Language does not guess from the Obsidian locale.** Someone writing in a second language would get it wrong and
not notice.

### No cover

An EPUB with no cover already degrades correctly: `.orbis-cover-fallback` draws the title and author wherever cover
art would go — the data view and the player both use it. So there is nothing to build here, and an optional cover
picker can come later without changing anything.

---

## Sections

The reader picks a heading level; the document splits there, one XHTML file per section, in document order.

- **The heading stays in its section** as that file's own heading. Readers show it, and consuming it into the TOC
  only would leave each section starting abruptly.
- **Content before the first heading gets its own section**, titled with the book title. Never dropped: silently
  losing the opening paragraphs of someone's writing is not a tradeoff, it is a bug.
- **Sub-headings nest in the nav.** Split at H2 and the H3s inside each section appear under it. A long section
  with no sub-entries is hard to move around in, and the TOC panel already handles nesting
  (`flattenTocWithDisambiguation`).
- **No headings at the chosen level** → one section, the whole note. Valid, not an error.

---

## The anchor map

Splitting into files breaks every internal reference, because an anchor's target may now live in a different file.
So the split builds **one map from anchor id → section file**, and every internal `href` is rewritten to
`sectN.xhtml#anchor`.

**Footnotes need exactly the same map.** Obsidian renders footnote references pointing at a list at the end of the
document; after splitting, that list is in the last file. Without rewriting, every footnote in the book is a dead
link. So footnotes and intra-document links are one mechanism, not two.

**Footnote ids are made stable first** (`stableFootnoteIds`). Obsidian ends each one with the render's `docId`,
sixteen random hex characters, so two builds of an unchanged note differed in every footnote and a rebuild could
never be found identical to the book already there (see [Replacing a book](#replacing-a-book)). Each docId becomes
its order of appearance, which keeps an embedded note's footnotes apart from the note's own.

**Block ids are anchors too.** Obsidian strips `^blk` from the rendered text and marks the block with nothing, so
`anchorBlockIds` replaces each marker in the SOURCE with an empty `<span id="orbis-block-blk">` before rendering. The
positions come from the metadata cache's `blocks`, so a `^` in a code block or in prose is never taken for one. The
map answers `^blk` with that span, and `[[#^blk]]` and `[[Note#^blk]]` land on the block like a heading link.

**A link that names a note looks in this note's anchors only when it names this note.** `[[003-Trails#Overview]]`
in a note with its own Overview used to land on that one, because the fragment was looked up before the note part
was read. A link to another note's heading goes to the folder's resolver, and a web address's `#results` is the web
page's.

**Wikilinks whose target is not a heading in this note are stripped to their text.** A dead link inside an ebook is
worse than the words alone. **External links are kept**: `https://` is valid EPUB content, and foliate opens it in
the system browser.

---

## Stylesheet

Minimal, and **no color declarations except `currentColor`**.

Orbis applies its own display styles over the book: font family, size, line height, margins, justification, and the
page's theme colors. Anything the EPUB declares fights that. Color is the sharp case — a book that hardcodes dark
text on white reads badly in dark mode, and unlike a plugin bug that would be **baked into every book you
generate, permanently**.

So: relative units, and only enough rules to keep tables, code blocks, blockquotes and callouts legible.

---

## What does not survive

The analysis step exists to say this *before* the conversion, not after.

| | |
|---|---|
| External links | **kept** — see [The anchor map](#the-anchor-map) |
| Wikilinks to other notes | stripped to text — there is no vault inside an EPUB |
| Tags | kept as text, and not counted as lost links |
| Embedded notes and headings | **kept** — the renderer resolves them; the embedded note's properties block is dropped |
| A missing embed | dropped — Obsidian's "could not be found" message is not the note's text; a missing image is counted |
| Dataview and other plugin blocks | render to nothing in a detached element, counted as empty blocks |
| Math | **dropped and counted** (`losses.svg`) — MathJax custom elements an EPUB reader cannot draw |
| Mermaid | **dropped and counted** — in a vault that has not allowed it, Obsidian renders a trust prompt, which leaked into the book as text |
| Callouts | kept as structure, styled minimally; the icon is decoration, dropped and not counted |
| Details | unwrapped, with the summary as a line of its own |
| Footnotes | kept, via the anchor map |
| Images | kept — see below |

## Images

Kept. `book-extractor.ts` already walks each `<img>` in a document, writes the binaries out and rewrites `src`;
this is the same operation mirrored — resolve each `src` to a vault file, add it to the zip, rewrite to a
zip-relative path.

A book of your notes with the diagrams silently missing is a bad first impression, and the inverse code exists, so
the cost of including them is low.

---

## The library

A converted book should not have to be discovered by a scanner that then guesses at what it is: both generators are
ours, so each writes the title note as it writes the book. The catalog side is in
[Library](library.md#cataloging); this is what the converter does.

**Where title notes go is the library's own answer**, and the converter uses it. A dialog about making an EPUB is an
odd place to settle where a plugin keeps its notes.

### What the dialog gains

**Type**, offering the values already in use across the vault plus any configured on the Fields page, with room to
type a new one — writing it is what makes it a value in use, so it appears everywhere else by itself. It defaults
to `book`, which on a fresh vault is the only value there is. **Publisher** and **publication date** join the
metadata fields: they are read from the source note, and collecting them means everything the title note gets is
something the reader saw and could change. And the summary gains a second line — **where the title note will go** —
beside the resolved path of the EPUB itself.

**One type answers a whole run.** In the book-per-note mode the picker sets the type for all N books, and says so.

**The picker writes back to the setting.** A default type on the Export page and a dialog that remembers the last
choice are the same thing, and having both guarantees they disagree within a week.

**None of it appears when the library is off.** No type, no title note, nothing written — a record for a feature
that is switched off is a note with no purpose. Turn the library on later and those EPUBs appear in the catalog
review like any other uncataloged book.

### What gets written

Through the same writer cataloging uses, so a generated note carries `orbis_note: title` from the first line and
needs no adoption. **The EPUB is written first**: a record pointing at a file that failed to package is a broken
Read button, and cataloging orders its own writes the same way.

| Field | Value |
|---|---|
| `title`, `authors`, `language`, `publisher`, `publication_date` | Whatever the dialog holds — the reader has seen every one |
| `type` | The picked type |
| `files` | The EPUB just written |
| `source` | `markdown-note` for one note and for each book in the per-note mode; `markdown-folder` for a folder converted into one book |
| `source_notes` | Links to the notes it was made from: one, or one per note in a folder |
| `added` | Today — the day it joined the library |
| `genre` | Nothing. A deliberate omission, not an oversight |

**Reading the source note's frontmatter is the converter's own business.** It seeds a dialog the reader then looks
at, so a mapping here is a guess someone can see and correct before anything lands — which is why the converter
may read keys the library itself never would. It reads `published` as the publication date (the Obsidian Web
Clipper writes it) and the clipper's `source` as **`source_url`**, since ours means provenance and theirs is a URL.
It does **not** read the clipper's `created` as `added`: that is when a note was made in the vault, where `added`
is when a title joined a library, and conflating them would date a book two years before you made it.

The library ships no aliases. A reader who wants clipped notes read as records *without* converting them adds that
mapping once on the Fields page.

### Regenerating, and books that already have a record

**The record is about the EPUB, so the EPUB is its identity.** Regenerating onto the same path updates that title
note; a new path writes a new one. Convert one note twice to two destinations and there are two books, two records
and one source note linked from both, which is honest — they are two books with two reading positions.

That holds even when the converter did not write the record: overwrite a path that some cataloged book already
occupies and **its** record is updated, gaining `source_notes` it never had. The record follows the file, and the
file just changed.

**The converter owns exactly the fields its dialog collects.** A rating, a reading status, tags, a hand-written
body all survive. `aliases` follows the title since it is a copy of it; the note's filename does not, because
renaming a note to match a retitled book breaks every link into it.

### The index note is not a record

The book-per-note mode also writes a Markdown note linking all N books. It has a title and links, so it is
record-shaped and is not a book — it carries **`orbis_generated: epub-index`**, which keeps it out of the catalog
and out of the review's adopt list, both of which already ignore generated notes.

### Deleting a converted book

Whatever the library settles for every book — see
[When a book is deleted](library.md#when-a-book-is-deleted) — applies here unchanged: a deleted book
takes its untouched title note with it, a record linking two files survives losing one, and the index note is left
alone with a link to something you deleted on purpose. Editing someone's note to tidy that link would be worse than
the dangling link.

---

## Replacing a book

**Overwrite or cancel. No versioning.**

Two EPUBs of the same book is a worse outcome than one stale one — you would then have two sets of annotations,
two entries in the library, and no way to tell which is current.

But the warning has to say the real cost, which is not the file: **Orbis keys annotations and progress to the file
path, so the `.orbis` survives a regeneration — and its CFIs point into the old text.** Highlights can land in the
wrong place or stop resolving. Same class of problem as `orbis_cfi` in the records.

**The new book is built first and compared with the one at its path** (`compareEpubs`, `epub-replace.ts`). A build
is repeatable byte for byte apart from the identifier and the modified stamp, so the comparison is exact:

| The rebuilt book is | What happens |
| --- | --- |
| identical | Not written. The notice says the book is already up to date |
| the same text — only details such as the author or an image's bytes differ | Written without asking: no saved position can move |
| a changed text — a chapter, or the order of chapters, differs | Written after asking, when the book there has annotations |

**Annotations, not reading progress**: highlights, notes and bookmarks (`savedAnnotationCount`). A changed text can
move a reading position too, but reopening a paragraph off is not worth stopping for; a highlight on the wrong words
is.

A changed text with no annotations still asks for a single note or a folder made into one book, with the plain
"There is already a file with this name here": the name and folder are typed by hand, so the file there could be any
book. A book Orbis cannot read as an archive counts as a changed text for the same reason.

**The book, not the notes' dates.** A note's date says nothing about whether the book has its text: a sync can
deliver an older edit after the book was made. And the same notes convert to different text when the chapter breaks
change, a note they embed changes, or the converter does. Comparing what the positions point into answers all of
these at once.

**The question names the cause in one phrase** — "the source changed after generation" — because "positions may
shift" with no cause reads as though the reader did something wrong. The guide lists what counts as the source
changing; the dialog stays short.

**A book sent out of the vault is not compared at all.** **Export…** and **Share…** — the second button the
single-book dialogs share with the PDF exports, from `outsideButton` in `outside-vault.ts` — build the same EPUB and
hand it to the system save dialog or the share sheet. Nothing at the vault path is read or written, so there are no
annotations to protect, and no title note: a record points at a book in the vault. The save dialog asks before
replacing a file itself. **Save folder notes as EPUBs** has no such button; its books and contents note are one set
that lives in the vault.

---

## Surfaces

**The destination lives in a fold in all three dialogs, and the fold's header shows the resolved path.** The
destination is *visible* without a control, and correcting a wrong one costs one extra tap on a rare correction. The
label is **Save to** rather than "Folder", which would be a bare noun on a screen with three other folders in play
(the source folder, the vault root, and the folders inside the file names). A vault-root target keeps its leading
`/`, so "the root" is something you can see rather than infer from an absence.

Two: *Save note as EPUB…* in the palette, enabled when the active file is Markdown, and the same item on a
Markdown file's context menu in the file explorer. Browsing for the note is the more natural entry when you are not
already in it, and the file menu is where a **folder** entry has to live.

The command opens one dialog: the book's title, two folds whose headers are their own answers — the resolved path,
and the metadata — then the heading-level picker, the resulting section list, and the warnings above. The section
list refreshes as the level changes, so choosing a level is a decision you can *see* — a 40-section book is obvious
before you make one.

**Folds, not an edit stage**, in all three of these dialogs and in Save as PDF. A stage hides the dialog's own
confirm button while you are in it, so changing a folder would mean going in, coming back, and then converting. A
header that carries the answer is readable at a glance and editable in one click, with no second glyph to explain.
`answerFold` is the shared implementation.

### The level picker

**A dropdown of the levels the content has**, not a row of buttons over every level.

A button row would wear `.orbis-adv-scope-toggle`, which everywhere else in the plugin is an independent on/off
switch — four search scopes, Match case, Whole word — and a style built to read as on-or-off cannot make one option
beat four others. Three things follow, none of them available to a button row:

- **Empty levels are left out.** A visible row of buttons reads as the whole set, so hiding H3 would raise "is that
  option missing?". A dropdown is not read as an inventory.
- **H5 and H6 are reachable.** A button for every level would wrap to three rows on a phone.
- **The preference is separable from the content.** `epubSplitLevel` is a setting; `resolveSplitLevel` meets it
  against the headings a note actually has: the nearest deeper level that has headings, unless the shallower level
  with the most headings has MORE of them than that deeper level, and "one section" only when there are none at all.
  Deeper first because a preference for H2 met by a note of H3s wants the chapters one level down; the count because
  a novel of 144 H1 chapters with five stray H3s does not nest, and splitting at H3 would cut it into six sections;
  shallower as a fallback because a note whose headings are all H1 has a perfectly good split that must not
  collapse. The two functions are pinned to agree by a round-trip test — a `<select>` set to a value it
  has no option for silently shows the first one instead, which would leave the screen claiming a split it is not
  making. That case is reachable in the folder dialogs, where unticking notes can remove a level.

A note with no headings at all gets a statement instead of the picker: a dropdown with one option is a control that
cannot do anything.

---

## A folder of notes

One folder of Markdown notes → one EPUB, where the notes are chapters and the links between them still work. That
last clause is the whole point: without it a folder is N disconnected documents in one file.

### Scope

**Top-level `.md` files in one folder. Not recursive.** "Everything to be included is in this folder" is a rule
someone can hold in their head and satisfy by dragging files; a recursive walk needs a second rule about what
subfolders *mean* (parts? nested nav? ignored?) and every answer is a guess about someone else's organization.
Attachments are unaffected — images resolve through `getFirstLinkpathDest`, which searches the whole vault, so a
diagram in an `attachments/` folder elsewhere still packages. `http(s)` images keep the existing off-by-default
toggle.

### Order

Filename sort is not semantic, so it is the *fallback*, not the rule.

**An index note names the order.** If the folder holds `README.md`, `index.md` or `home.md` (first match, that
precedence), the order in which that note links to its neighbors is the order of the book. This is not a
convention invented here — it is what a folder of documentation already looks like, and the note that explains the
reading order is the one a human already wrote.

Two rules make it safe:

- **A note the index does not link to is appended, not dropped**, in filename order after everything the index
  named. Losing a chapter because someone forgot a link is the kind of failure you discover three chapters in. The
  preview says how many arrived this way.
- **Filename order is numeric-aware** (`localeCompare(…, {numeric: true})`), so an unpadded `10-` does not sort
  before `9-`.

With no index note, filename order is the whole rule.

**The index note is matched through its sorting prefix.** `001-README.md` is a README. Otherwise the prefix this
very rule encourages would hide the note that drives it, and the book would fall back to filename order and take its
title from the folder name.

**This is a default, not a decision the reader cannot revisit.** The ordering rule gets a folder that is already
laid out for this right; the chapter list in the dialog is for the folder that is not — a note that belongs at the
front, a scratch file that belongs nowhere. The index note seeds that list rather than dictating it.

### One note, one section

**A file boundary is always a section boundary.** Never merge two notes into one section, and never let a section
span two notes.

With it, editing one note and regenerating shifts only that note's own CFIs instead of every CFI after it in the
book. Annotations elsewhere in the book survive an edit to chapter five.

The per-note **split level** (the existing heading-level control) still applies *within* a note, and defaults to 0 —
do not subdivide. Turning it on is a real trade and the UI should say so: a note that grows a heading becomes two
sections instead of one, and every spine index after it moves. For a folder of ordinary documents that is
theoretical; for a folder of very long notes, splitting is what makes them navigable, and the annotation cost is the
price. The default is the safe one.

**The `epubSplitLevel` setting reaches the single-note dialog and not these two.** There a preference is the natural
default; here 0 is a correctness answer, and a preference expressed about single notes should not quietly reshuffle
the CFIs of a book built from thirty.

### What each section is called

`h1` of the note → its frontmatter `title` → its basename with a leading `\d+[-_. ]` **stripped**. The last clause
is not cosmetic: the ordering rule above encourages `001-`, `002-` prefixes, and a table of contents reading
"002-roadmap" would be the feature advertising its own workaround.

A note that does not open with a heading gets a synthesized `<h1>` of that title, or it lands in the book as a
section with nothing at the top of it.

**Nothing prepends the book title** in folder mode, unlike single-note mode where section 0 gets one. Every note
brings its own heading, and the index note's `h1` *is* the book title — printing it twice is how that would show up.

### What names the book

The index note again: its frontmatter `title` → its first `h1` → the folder's name. Author and language come from
its frontmatter on the same terms. A folder called `linked-notes-test` whose README says
"Orbis Reader — Design Documentation" should produce the second one; the folder name is a last resort, not a
default.

The metadata editor is unchanged — every one of these is a starting value the reader can overwrite before
converting.

### Links between notes

The one genuine extension to the pipeline.

`buildAnchorMap` keys the map by ids found *within* the document, and `domToXhtml`'s `resolve()` returns null for any
href with no `#` — so in single-note mode a link to another note flattens to plain text and is counted as a loss.
That is correct for one note (there is nothing else in the book) and exactly wrong for a folder.

For folder mode the map gains a second key space: **each note's vault path → the section file it landed in**, so
`](roadmap.md)` resolves to that section's file and `](roadmap.md#anchor)` to a position inside it. Resolution goes
through `metadataCache.getFirstLinkpathDest(href, sourcePath)` rather than string comparison, because the same href
means different files from different folders, and that is Obsidian's own answer rather than a reimplementation of
it. Wikilinks resolve the same way through `data-href`.

A link whose target is **not in the book** — a note outside the folder, or one the reader unchecked — still flattens
and is still counted.

Code fences need no special handling: the walker runs on rendered DOM, where `[[…]]` inside a fence is a text node
and never was a link.

Three details:

- **The link target is read from `data-href`, not `href`.** `data-href` is what the reader typed — `roadmap.md`,
  `[[roadmap]]`, `#Heading`; `href` on the same element is the rendered one, an `app://` URL on desktop and a
  `capacitor://` one on mobile. External links carry no `data-href`, so it falls back.
- **Anchors stay per note; only the note→file map is book-wide.** One anchor map across thirty notes is wrong in a
  way that is hard to see: two notes with a `## Overview` produce the same id, and a link from either would land in
  whichever was indexed last.
- **A fragment that cannot be placed still links to the file.** Flattening a link to text because one heading was
  renamed is worse than an imprecise jump that lands at the top of the right chapter.

The cost this design accepts: every note's anchors must exist before any note is serialized, because note 1 can link
to note 34. So a folder conversion holds all the rendered notes in memory at once. Fine at the scale this targets
(tens of notes); a folder of hundreds is the case that would force a two-pass design.

### Images and budgets

`collectImages` dedupes and enforces its size ceiling **per call**; across thirty notes that would be thirty
independent budgets and one copy of a shared diagram per note that uses it. So both are per book.

### The preview costs nothing

The single-note dialog renders the note once on open and re-partitions it as the level changes. Doing that for a
folder puts a multi-second render behind a screen whose entire job is to say what is about to happen.

So the folder preview is built from `metadataCache.getFileCache()` — `headings` gives the outline, `links` and
`embeds` give the counts — and **nothing is rendered until the reader confirms**. The cost is honest and worth
stating in the UI: loss counts are estimates until conversion, where the single-note screen's are exact.

### Which notes, carried explicitly

`FolderConversion` extends the shared conversion with the ordered list of note paths, and both the analysis and the
write read it rather than re-deriving the order. Re-deriving would quietly ignore everything the reader did in the
dialog, which is a bug that would look like the list not working. A path that no longer resolves at write time is
skipped rather than fatal: a note can be renamed between opening the dialog and pressing Convert.

The plugin's write path takes a **discriminated job** — `{kind: 'note', file, conv} | {kind: 'folder', folder, conv}`
— rather than a `TFile | TFolder` source, because only the folder conversion carries a note list and narrowing a
union of sources would leave the conversion's type to a cast.

### Where it lands

`<folder>.epub`, in the folder's **parent**. Writing it inside its own source folder would put the output where a
re-run reads its inputs — a loop — and no convention has to be remembered to avoid it.

Regeneration keeps the existing rule ([Replacing a book](#replacing-a-book)): overwrite or cancel, asked when the text
changed and saved content exists for that path.
The blast radius is larger here, which is an argument for the one-note-one-section rule above, not for a second
mechanism.

---

### The dialog

Right-clicking a folder in the file explorer offers *Save folder as EPUB…*. The item appears only on folders that
actually hold Markdown; an entry reporting "no notes here" on every folder in the vault is noise on every folder in
the vault.

A sibling dialog to the note one, not a mode inside it. The shell, the metadata editor and the summary block are
shared functions; what differs is the entire middle of the screen, and threading a source parameter through every
closure is the kind of "one function, two behaviors" that reads fine and gets edited wrongly a year later.

**The case that most needs saying is the note the index missed**, and the screen says it: *"3 notes are not linked
from README, so they go at the end in file name order."* Someone should learn that here, not by finding chapter 34
where they did not expect it.

**The chapter list is checkable and reorderable**, and three details in it are decisions rather than defaults:

- **Excluded notes stay in the list**, grayed, keeping their place. Removing the row would make the checkbox a
  one-way door — the only way to put a note back would be to cancel and start over.
- **Chapter numbers count positions in the BOOK**, not rows, so an excluded note in the middle does not consume a
  number and leave a gap where a reader would look for one. An excluded row shows an em dash: the column keeps its
  width, and "not in the book" reads as a statement rather than as something missing.
- **Once anything is moved, the order picker says so**, reading `README (customized)`. A picker still naming the
  index alone after a manual move would be a lie about the book being made.

Reordering is ↑/↓ **and** drag, hidden on touch — `dragstart` never fires from a finger, which is the same reason
the mark manager keeps both; the two share `wireListDrag`. The honest limit: moving a note thirty rows costs thirty
presses, which is an argument for getting the index note right rather than for a richer control.

Unchecking every note is a real state and disables Convert — a book with no chapters is not worth writing.

The split picker carries the cost of using it in its own description — each note is one chapter, and splitting
further "moves every highlight after it in the book when you convert again". A control whose downside is invisible
at the moment of choosing is a control people choose wrongly.

The warnings are headed **"Not everything carries over (estimated)"**. Said once, plainly. The note dialog's
numbers are exact because it has the rendered DOM; these are not, and quietly presenting an estimate as a count is
how a preview loses its credibility the first time it is wrong.

## A book per note

The same folder, converted the other way: N EPUBs in a new folder, plus a Markdown note that links to all of them.
*Save folder notes as EPUBs…*, beside the single-book item on a folder's context menu.

### Why it is a second answer and not a better one

The difference is not packaging, it is **what a book is**. One EPUB is one reading position, one set of highlights,
one searchable unit, one row in the library. N EPUBs give each document its own of each. Right for a reference set
you dip into; wrong for something read front to back.

Two things it buys that one book cannot:

- **It removes the CFI problem outright.** One-note-one-section protects annotations from edits elsewhere in the
  book; this goes further — edit a note, rebuild its book, and nothing in any other book moves, because there is no
  shared spine.
- **Per-document listening and recording.** A recording of a thirty-four document set is one enormous
  artifact as a single book, and one per document here.

And the cost, stated rather than buried: **search and navigation fragment.** Orbis searches within a book, so a set
is N searches. That is the trade, and why this is a command rather than a setting.

### Links become deep links

`obsidian://orbis-nav?file=<the other book>` — the protocol Orbis already answers by opening a book. Without this,
splitting into N books throws away the thing that makes a folder a book at all, so it is the load-bearing part of
the mode rather than a nicety.

A **fragment cannot survive**: the target's CFIs do not exist until it is built, and it is not built yet. The link
opens the book at its start. A link to a note's *own* book is left as text — leaving the book to come back to it is
worse than not linking.

The mechanism is the existing `NoteLinkResolver`: the resolver returns a URL where the single-book mode returns a
section file. `saveNoteAsEpub` takes it as an option, so a book in a set is built by exactly the same code as a
lone note.

### The contents note

**Always generated. Never adopted.**

The contents note is not a copy of the folder's index note, because the conversion already produces that: the index
note is itself converted, so `001-README.epub` already holds its curation, with deep links to the other books. Two
curated indexes in two formats, one of them a copy, is worse than one of each:

- **the generated `.md`** is the directory of files, flat and complete, and what you see in the file explorer;
- **the index note's own book** is the curated guide, read in the reader, where the links go to books.

Generating it means:

- **The order always means something.** The contents note is written in the dialog's order, so dragging rows
  changes it.
- **Every converted EPUB is listed.** No note can be missing from it.
- **Unchecking a note has one outcome.** It gets no EPUB, links to it inside other books flatten to plain text, and
  it is already counted in *"N links point outside this folder"* — that count is computed against the selection,
  not the folder.

**What the index note contributes is its ORDER.** The list is seeded from the notes it links to, which is a far
better default than file names for a curated folder (`indexLinkOrder`). **One** dropdown picks the seed: *File name
order* first, then every note in the folder. It is a **default**, not a source of content.

An option in a list is proportionate because the choice is a parameter — *where the order starts* — not a fork in
what the command produces. And it is one control, not two Settings: Obsidian draws its row divider between two
Settings, which would read as a section break between a control and its own argument. Choosing a different note
re-seeds the list and discards a hand reorder, because changing the source is a request to start again from it;
keeping the old sequence under a new heading would be the worse surprise.

**It is overwritten on every run, and it says so** — an HTML comment at the top, invisible in reading view and plain
in edit mode, the same idiom and the same reasoning as `RECORD_MARKER` in reading records. A stale list pointing at
half a set is worse than losing a paragraph someone added to a generated file, but only just, so the file admits
what it is rather than passing for an ordinary note.

**Source notes are not copied into the folder.** That would make the folder self-contained by making the vault hold
two copies of one note, which diverge the first time either is edited. Self-containment is worth having for books,
which is why they package their own images. A markdown note is not a package, and a stale duplicate is a worse
failure than a link that goes home to the original.

### Where it goes, and what things are called

`<folder> EPUBs`, beside the source folder — **never inside it**, or a re-run ingests its own output and the contents
note becomes a chapter of the next book. The name is editable and the parent is a folder picker; the resolved path
is shown under both, because it does not exist yet and there is nothing to pick it out of.

Each book is named for its **note's basename**, so a numbered folder stays in reading order on disk and the prefix
that made the ordering work is still there. The book's `dc:title` is the readable one — `002-roadmap.epub`, titled
"Roadmap".

### Its own dialog

**"EPUB" on this screen, "book" on the other one.** Not a style slip either way: `book` is the product's own noun
everywhere else in the reader, but on a screen whose subject is "you are about to get 34 files" it is ambiguous —
the sibling command turns this same folder into one book, so "only that book's own highlights can move" invites
"which book?". The rule: **when the screen makes many, count EPUBs; when it makes one, talk about the book.**

A separate command rather than a mode inside the folder dialog, and the metadata block is the reason: each book
takes its title and author from its own note, so those fields would be describing nothing. What is left at the set
level is the destination, the language, and an **author applied to any note that does not name its own** — usually
the only author there is.

Everything below that is shared with the folder dialog, including the chapter list: it decides which notes become
books and in what order, and that order is the order the contents note is written in.

**Both dialogs put the destination in a fold**, as the note dialog does. Four rows of form at the top push the
thing the screen exists for below the fold, and these are confirm-not-edit: the folder name is derived from the
folder you right-clicked and the language is effectively constant.

**Both folder dialogs carry the same order picker**, sharing one implementation: the note list state, the
re-seeding, the `(customized)` marker and the fold's open/scroll bookkeeping all live in one place, because the two
screens differ in vocabulary and in what the order *means* and in nothing else about this. In the single-book dialog
it means more, not less — the order there is the spine and the table of contents, where in a set it decides the
contents note.

**Neither dialog prints a sentence about where the order came from.** It would be a readback of the picker one line
above it. That a hand reorder has overridden the seed lives in the control, which reads `001-README (customized)`. A
control that states its own state needs no prose restating it, and cannot drift out of step with prose that says
otherwise. The one line that is *not* a readback stays: how many notes the seed does not link to.

**The chapter list folds, and stays closed on first paint. Its open state and scroll position survive a repaint** —
every move and every checkbox rebuilds the screen, so without carrying those across, dropping a row would close the
list under you and dropping row twenty would scroll you back to row one. Both make the second move harder than the
first, on a control whose whole purpose is making several.

It stays closed even for a short set: on a phone any open list pushes the warnings and the buttons below the fold,
and a control you have to scroll past is worse than one you have to open. The summary line carries the count while
it is closed, under a name — *Notes to convert* — because an unnamed fold reading "34 EPUBs" looks like a statistic
rather than something you can open and edit.

**The two screens share every control and almost no vocabulary.** In the single-book dialog a note is a *chapter*
and splitting shifts every highlight after it *in the book*; in this one a note **is** a book, there are no
chapters, and splitting shifts highlights inside that one book **and no other** — which is the mode's whole
argument, so saying it the other way round sells it short. The shared renderer takes a mode and picks its strings
from it, so this screen never tells readers their notes are chapters.

**One summarized confirmation, not thirty-four**, and only when a book whose text changed has annotations in it:
"3 of the previously generated EPUBs have annotations, and their sources changed after generation…". Asking per book
would train you to click through it, which is exactly when the one with your highlights in it goes. A book identical to its rebuild is not written, so editing one note rewrites one EPUB; the notice says how
many of the set were saved and that the rest were already up to date.

On success the contents note is **opened**, not merely mentioned: it is the entry point to the set, and a notice
naming a folder is something you then have to go and find.

### Deep links, tables and titles

Each of these is invisible to unit tests and obvious in the output, which is the argument for converting a real
folder before believing any of this.

- **The link-preview interceptor bails on any scheme**, using foliate's own `isExternal` test so the two cannot
  disagree. A link to another book is not an in-book href, and treating it as one would `preventDefault` it and show
  *"could not load preview"*. That also covers `kindle:`.
- **Wikilink aliases inside table rows are escaped.** A documentation index keeps nearly all of its links in a
  table, and an unescaped `|` inside `[[book|Label]]` is a column break that cuts the link in half. Escaped as `\|`
  on table rows only, where it is needed.
- **The book title is prepended only when the section does not already open with a heading.** A note that opens
  with `# Title` would otherwise get two headings — in a single note as much as in a set.
- **The reader opens a deep link itself.** foliate treats anything with a scheme as external and hands it to
  `globalThis.open`, which for `obsidian://` means leaving the app to ask the OS to return to it — a protocol
  registration, out of a WebView, on a phone. The reader listens for foliate's `external-link`, cancels it for
  `obsidian://orbis-nav`, and opens the file itself. Same destination, none of the round trip, and it behaves like
  navigation: same tab, so the back arrow returns to the book you came from. An `https://` link in the prose is
  untouched and still opens in the browser.
- **foliate deletes the query string.** `resolveURL` in `epub.js` does `obj.search = ''` on every href it
  resolves — deliberately, because inside an EPUB a `?` means nothing and calibre is known to add junk. So the
  handler reads the **anchor's own `href` attribute** from the event detail rather than the resolved href: that is
  the only place the whole URL still exists. Worth knowing before designing any other in-book URL — **a query string
  cannot survive an EPUB href**, so a scheme that needs parameters has to carry them in the path or the fragment, or
  be read off the element.
- **No empty `&cfi=`.** A link to a whole book carries no parameter that says nothing (the handler would read it as
  no position, but it is still wrong).

### Known costs

- **Images are packaged per book.** A diagram used by six notes is stored six times. Fine at documentation scale,
  worth knowing before pointing this at a folder of image-heavy clippings.
- **The contents note is overwritten** on every run, like the books are. A stale contents page pointing at half a
  set is worse than one that matches what was just written.

---

## Validation

**Round-trip is the test, and we ship the reader for it.** Export a book to Markdown, convert it back, open it in
Orbis. Fidelity will be poor — formatting is lossy in both directions — but it proves the package is structurally
sound, which is the part that is easy to get subtly wrong and hard to notice.

Beyond that: an EPUB that opens, paginates, produces a TOC, and can be searched and annotated is exercising nearly
all of the reader.

---

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | One note, a folder as one book, a folder as one book per note | Each is a different answer to what a book is |
| Zip writer | Add `fflate`, use `zipSync` | Both vendored copies are decompress-only; this is the only missing capability |
| `mimetype` | First entry, `level: 0` | A reader may reject the archive otherwise |
| EPUB version | 3, `nav.xhtml`, no NCX | Nothing needs EPUB 2 compatibility |
| Markdown → HTML | `MarkdownRenderer` + sanitize | A bundled parser loses callouts, footnotes and math silently |
| Metadata source | The frontmatter Book Export writes | The two features compose; defaults are usually right |
| Frontmatter keys | Respect `frontmatterKeyLanguage` | Native keys otherwise match nothing and every field looks empty |
| Language | frontmatter, else `en` — never the locale | Writing in a second language would silently get the wrong value |
| Cover | None | `.orbis-cover-fallback` already draws title and author where art would go |
| Pre-heading content | Its own section, titled with the book | Dropping someone's opening paragraphs is a bug, not a tradeoff |
| Sub-headings | Nested nav entries | A long section with no sub-entries is hard to navigate |
| Internal links + footnotes | One anchor→file map, scoped together | Splitting breaks both; the second is nearly free once the first exists |
| External links | Kept as links | A wikilink to another note has nowhere to go; `https://` is valid EPUB content and foliate opens it in the system browser |
| Stylesheet | Minimal, no colors but `currentColor` | Orbis styles the page; a hardcoded color would be baked into every generated book |
| Regeneration | Overwrite or cancel, warn when saved content exists | Two copies is worse than one stale one; the real cost is CFIs pointing into old text |
| Surface | Palette command + file-explorer item | The second is where a folder entry has to live anyway |
| Destination | In a fold, resolved path in its header | Visible without a control; one pattern across three dialogs |
| Folder scope | Top-level `.md`, not recursive | One rule someone can hold in their head; subfolders need a second rule about what they mean |
| Folder order | Index note's link order, else filename | The note explaining the reading order is one a human already wrote |
| Notes the index misses | Appended, never dropped | Losing a chapter to a forgotten link is found three chapters in |
| Sections in folder mode | One note = one section | Editing one note then shifts only its own CFIs |
| Book identity | Index note's title/`h1`, else folder name | A folder name is a last resort, not a default |
| Cross-note links | Anchor map keyed by vault path too | Without it a folder is N disconnected documents in one file |
| Folder preview | Metadata cache, nothing rendered | A multi-second render behind the screen that explains the wait |
| Output location | `<folder>.epub` in the parent | Output inside the source folder is a loop |
