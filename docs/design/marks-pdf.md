# Marks → PDF

Send someone a PDF of what you marked in a book and what you wrote about it.

The digest and the whole marked-up document, with tables, an outline, links of both kinds, and an optional
downloaded font for the characters the built-in ones cannot draw.

---

## Why

The workflow it serves: someone writes a document, you convert it to an EPUB
([Markdown to EPUB](markdown-to-epub.md)), read it in Orbis, mark the passages that need attention and write notes
on them — and then need to give that back to the author. Everything before the last step already works. The last
step needs an artifact **the recipient can open with nothing installed**, which is the one thing an EPUB with
annotations is not.

That is also what separates this from [§8.6 Shareable annotations](roadmap.md): sharing an annotated EPUB keeps the
annotations live and requires a reader that understands them; a PDF is read-only and universal. For "here is your
document back with my comments", universal wins.

---

## The stack, and what was rejected

**`pdf-lib`, drawing real text.** It adds roughly 400 KB to the plugin.

jsPDF's `.html()` is not used: it renders through html2canvas, and **html2canvas rasterizes**. The PDF then
contains images of text, which means:

- not searchable, not selectable, not quotable — on an artifact whose purpose is being read and quoted from;
- nothing at all for a screen reader;
- a rasterized page of text at 2× is 200–500 KB, so a book runs to hundreds of megabytes;
- rasterizing a whole book needs canvases no phone survives, which is the opposite of the "mobile-safe" claim
  usually made for it.

Page breaking is the other rough edge: jsPDF slices the canvas at page height, and its `autoPaging: 'text'` only
approximates avoiding split lines.

The price of drawing text instead is that **we own the layout**. For the digest that is a word-wrap loop and a page
cursor. For the whole document it is a simplified typesetter, which is a real project but a bounded one — see below.

**Platform print-to-PDF is desktop-only.** This plugin holds Android and iPad parity as a rule, and `pdf-lib` keeps
it: the same code produces the same file on every platform.

### Fonts

The built-in fonts are the fallback. They cost nothing and can draw about 220 characters, which is the whole of
WinAnsi — so an arrow prints as `?`, and a book in Greek or Cyrillic as a page of them. **DejaVu** is downloaded on
request instead.

**Why DejaVu: coverage.** The serif faces carry ~3,440 characters: arrows (including `↩`), mathematics, currency,
Greek, Cyrillic, accented Latin, `§ ¶ © ° ± №`. The sans carries ~5,900, adding `✓ ✗ ☐ ☑`. One family, one
license, and the sans is already the face used for commentary, so the fallback target is a font the export loads
anyway. Seven faces, 3.1 MB. The license (Bitstream Vera derivative) permits redistribution and embedding; the text
ships in `licenses/`.

**Downloaded, not bundled.** Bundling would put 3.1 MB in `main.js`, loaded on every device for every user
including everyone who never exports a PDF. They are fetched once to
`.obsidian/plugins/orbis-reader/font-cache` and cached, the pattern Piper's voices use too: **bundle the code,
download the data.** `@pdf-lib/fontkit` is the code half, and it is not free — it adds 0.9 MB to `main.js`, which
is the price of being able to embed a font at all.

**Verified, not trusted.** Each face's SHA-256 is in the manifest and checked on download. These bytes come from a
CDN and end up embedded in a document the reader sends to someone else; pinning the version says which file was
asked for, and the hash is what says it arrived. A mismatch fails the download rather than caching it.

**Asked for where the decision is made.** A pre-checked switch in the export dialog, shown only while the faces
are missing, and a row in settings to check afterwards or get the space back. Declining is allowed: the built-in
fonts still draw the document, and an export made offline should produce a file rather than an error about a CDN.

**Subset on embed**, which is not optional at this size — seven whole faces would add 3.1 MB to every exported
file. Subset, a document that uses six of them costs about 50 KB.

**Two things the font cannot fix**, both handled separately:

- **Strings that are not drawn.** A note's body, its author, and every outline title are PDF *strings*, and a PDF
  string is Latin-1 unless it is UTF-16. They are written as `PDFHexString.fromText`, so a note in Greek arrives
  intact in the viewer's comment pane whatever font is installed.
- **A face that lacks one glyph.** Coverage splits the runs a second time inside `runsIn`, so a `✓` in a serif
  paragraph is drawn from the sans. Doing it there rather than at the draw call is what keeps measuring and
  drawing in agreement — a substituted face changes the width a mark is drawn at too.

Still out of reach: CJK (16 MB *per weight*) and any script needing bidi or contextual shaping, which pdf-lib does
not do at all. Those degrade as they do without DejaVu — a space for a pictograph, `?` for anything else, length
preserved.

### What sanitizing still does

`drawText` **throws** on a character the font cannot encode — so an unrepresentable character does not produce a
worse PDF, it produces no PDF, from inside a library, with a message about a character code. `sanitizeForPdf` is
what stops that, and it still runs with DejaVu installed; it is simply asked a wider question. Its predicate is
"can any embedded face draw this", defaulting to WinAnsi when none are.

**It is length-preserving, and that is not a detail.** Marks are ranges over the document's text, so a character's
index has to survive every transformation between the DOM and the page; mapping `…` to three dots would shift
every mark after the first ellipsis. Each unencodable code point becomes exactly as many replacements as it
occupied — a space for a pictograph, `?` for anything else. An emoji drawn as a picture is the exception: it keeps
its whole grapheme (see *Emoji*).

**A mark appears in the PDF as its name, its color and its treatment — never its badge.** A badge is Markdown's
stand-in for color, and the PDF draws the color itself; see *Emoji*.

---

## The two artifacts

*Save as PDF…*, from the command palette or the pane menu, with a book open.

**Marks are optional.** They are why the feature exists, and a plain PDF of the book is the other thing people
want from it. So the whole-document export has a switch, and four things follow from it rather than being separate
decisions:

- **The cover sheet is hidden, not disabled.** Its whole content is the legend explaining the marks, so with them
  out there is nothing left for it to say and the switch cannot do anything whatever it claims. Graying it would
  decide for the reader, and leaving it live would be worse, a switch that does nothing. Hiding it is the answer
  this dialog already gives twice — the marks switch goes when the book has no marks, the chapter section goes for
  a digest.
- **"Only the chapters with marks" disappears**, and a selection already made that way resets to all — leaving it
  would quietly export six chapters of a thirty-four chapter book.
- **The summary line stops counting marks**, and the byline goes with it: whose marks these are is not a fact
  about a PDF with no marks in it.
- **The digest ignores the switch entirely**, which is why it is shown in document mode only. A digest of the
  marks with the marks left out is not an artifact.

The switch is hidden when the book has no marks at all — there is nothing to include, and a control that changes
nothing invites the reader to wonder what it did.

**How it is implemented:** by withholding the style map. Every mark is drawn by looking its annotation up, and one
that is not found is skipped, so an empty map drops the washes, the treatments and the note pins together —
without rewriting the blocks or teaching the writer about an option it does not need to know.

## Phase one: the digest

**It parses no EPUB.** Everything it needs is already in the annotation data — the passage, the mark, the note, the
chapter, the location — the same data reading records and note export read. So the whole feature is
`notesData()` → `pdf-lib` → file, and it is available the moment a book is open.

### What is in it

- A header: the book's title, its author, who marked it up, and the date.
- Chapters as headings, in **table-of-contents order** — keyed on `href`, not on the label, because chapter labels
  repeat across parts ("PART II > CHAPTER I"). The same identity reading records sort by, so the two features
  cannot disagree about what order a book is in.
- **Under each chapter, the subheadings its marks were filed under** — see below.
- Inside each chapter, entries in **`cfiSortKey` order**, again as the records do: `loc` is too coarse, since a
  location spans many paragraphs and several highlights in one chapter often share one.
- Each entry: the passage with its mark drawn on it, the note underneath, then the mark's name and the location.

#### A chapter is a top-level contents entry

**Unless that entry contains chapters.** `containsChapters` (`toc-utils.ts`) opens an entry with at least two
children spread over more than one spine file, and `topLevelChapters` gives it a row for its own stretch and a row
per child, recursively — so a book that lists its title as a heading over all its chapters, or an omnibus of
novels, still has a row per chapter. **Files decide it, not text:** a chapter's subheadings share its file — the
converter's nav-per-heading, which is why grouping by top level exists at all — while parts, novels and recipes are
files of their own. "No text before the first child" is not the test: it splits nonfiction chapters that open on a
subheading, and a converted note, and keeps parts that open with an epigraph. The reader view marks each entry's
section once at load (`markTocSections`), so all four surfaces read the same answer; an entry whose href does not
resolve never opens.

A mark is filed under the **deepest** contents entry that matches it, which is the right key for placing one and
the wrong one for a heading. Grouped by that key alone the digest would be a flat run of subheadings — `Settings
storage`, `Phase 7: Accessibility` — with nothing saying which document each belonged to; on a book converted from
a folder of notes, where the converter writes a nav entry per heading, that would be the whole file.

`groupMarksByChapter` folds its buckets through `groupByTopLevel`, the same fold `buildNotesMarkdown` uses, so a
digest and a generated note set cannot disagree about what a chapter is. A flat contents page yields one group per
entry with no sections.

**`MarkChapter` is `{title, entries, sections}` — nested, not a flat list with a depth on each row.** A flat shape
would be wrong: `chapters.length` is printed, in "N marks and notes across M chapters", and a depth field makes
that count chapters and subheadings together. Two things fail silently if this is missed — `countMarks` must sum
the sections, since most marks live under one and the same number guards "nothing to write"; and the empty-chapter
filter must run **before** the fold, or every chapter whose marks are all in subheadings loses its heading.

A chapter draws at bold 13 and a subheading at bold 11 with less air above it. A PDF has no `##`, so size and
weight are the only vocabulary available. `level` is the outline depth too, so the digest's nested contents tree
comes from the same call.

**A subheading takes the contents' plain `label`; only a chapter takes `displayLabel`.** The parent qualifier exists
to tell two `Commands` entries apart in a flat list — under the chapter heading it qualifies with, it is the
chapter's own name twice.

#### The words, as the book wrote them

Two transformations, and only one of them touches what the book said:

- **`closeGaps`, headings only.** `sanitizeForPdf` substitutes one filler per code unit so a mark's offsets survive
  it; a heading carries no offsets, so there the filler is pure cost — where no picture can be drawn,
  `Phase 7: Accessibility ✅ (see §5.3)` would draw as `Accessibility␣␣␣(see`. It closes inside the writer, because the character is still a single emoji until
  it is encoded and only the writer knows which faces are embedded: a reader with DejaVu installed keeps a glyph a
  caller sanitizing against WinAnsi would have thrown away.
- **`collapseWhitespace` on a passage**, which tidies runs of spaces. Typography, not structure.

**Every line break the book gave a passage is kept**, in the digest and in a generated note set alike. Where the
book breaks a line, so does the quote, even where that reads oddly on a page of a different width.

**No re-flow, and no switch for one.** A book converted from hard-wrapped Markdown carries a `<br/>` per source
line, so its quotes break short of the margin. Re-flowing them means guessing which of an author's breaks were
meant — a highlight that starts on a heading holds the heading, a newline and the paragraph; a list item or a line
of verse is a break somebody meant; and a line's length cannot tell a wrap from a heading reliably — and the guess
is about a book nobody here has read. The digest quotes what is there; a break that looks wrong on the page is the
book's, and reproducing it is the export being honest rather than tidy. The same rule the outline follows: *report
the structure the EPUB marks up, never infer one.* A switch offering "guess, or don't" would still have to be right
about which answer to default to.

`selection_block` puts `> ` on every line of a quote, and **Obsidian collapses single newlines on render by
default** — so a note set *displays* as flowing text while its markdown matches the book. Only the PDF, which draws
literally, shows every break.

**Passage selections and notes only.** Bookmarks are places rather than commentary, and a review copy is about what
you said.

**Attribution is optional**, and answered in two places: a name set on the settings page, which the dialog opens
on and either keeps or replaces for one export. A person has one name, so typing it every time is friction that
ends in a shared copy with nobody's name on it — but a shared copy usually wants a name and a personal one usually
does not, so the dialog keeps the field.

### How it looks, and why

**The book's prose is serif; your commentary is sans.** One signal, costing nothing, saying on every page which
words are whose.

**Marks are drawn in both channels**, exactly as the reading surface draws them: the wash as a translucent
rectangle behind the text, the treatment as a line over it. That matters more here than it looks — treatments exist
so a mark carries meaning without color perception, and a PDF that flattened them to color would drop the
accessible channel at the moment the document travels furthest.

**US Letter, and not a setting.** A page size nobody chose beats one more question on a dialog.

### The dialog

One line at the top saying what the file will hold, folds whose headers are the answers — the resolved path, the
byline — and every other control describing only itself. Save is disabled when there is nothing to write. Three
export dialogs that looked like three different features would be a worse outcome than one more file sharing
their idioms.

**The line at the top is the only place that reports an outcome.** Everything below it describes a choice. A
static note describing the output under a control goes on describing it after a switch further down changes it;
a dynamic one is a paragraph near the top of the dialog that mutates when you flip a switch near the bottom,
saying what the summary line already says. Reporting belongs in one place, above everything that changes it.

**The export asks before replacing a file**, with the same Replace-or-cancel dialog the EPUB exports use — one
shape, in `OrbisModal`. **There is no Cancel while it runs**: a long novel exports in seconds even on a phone, so
there is nothing to escape from.

**Two destinations, chosen by the button.** Save writes to the folder in the **Save to** fold. A second button, set
apart at the start of the footer (`orbis-action-aside`), sends the same PDF out of the vault: **Export…** on a
computer, through the system save dialog, and **Share…** on a phone or tablet, through the share sheet. A choice
inside the fold would make Save mean different things depending on a control the reader may not have opened, and would
need a remembered default to answer it; a button asks nothing and remembers nothing. Export asks where before anything
is built, because a whole book takes a while and a cancelled save dialog should cost nothing, and the system dialog
asks before replacing, so the vault's replace prompt is Save's alone. A shared PDF waits in the plugin folder, not the
vault, and is cleared before the next share and when the plugin loads: the app it is shared to reads it after `open`
returns. The two routes, and why each is looked up at run time, are in `src/outside-vault.ts`.

---

## Phase two: the whole marked-up document

It builds on the digest: word wrap, page breaking, font handling, mark drawing and the file write are shared, and
phase two adds block layout on top.

### What it needs

**Text with structure, and marks anchored into it.** Both already exist in this codebase:

- `section.createDocument()` gives a parsed `Document` per section — `book-extractor.ts` uses it for
  EPUB → Markdown.
- foliate ships `epubcfi.toRange(doc, parts)`, so a stored CFI resolves to a `Range` in that document.

So the loop is: walk each section's blocks in order, lay out the text, and where a mark's range intersects the run
being drawn, decorate it. No new anchoring machinery.

**Blocks supported:** headings, paragraphs, lists, blockquotes, code blocks, images and tables.

### Tables

**A cell keeps its own text, marks and emphasis.** Offsets index into one string, so cells sharing a string would
draw every highlight in whichever cell the arithmetic reached. `BlockText` is the shared shape, and a `table` block
holds rows of them.

**Columns are sized from what they ask for.** `columnWidths` in `pdf-layout.ts` — pure, so the arithmetic is
tested without a font — takes each column's natural width and, when they overflow, scales them in proportion so a
column of dates stays narrow and a column of sentences takes the room. Each column also carries a floor: **its own
longest word**. Without it, proportional scaling can give a `Meaning` header beside a column of sentences a share
too narrow for the word, and draw it as `Meanin` / `g`. The floors are paid for by the columns above theirs, in
proportion, which never pushes one of those below its own floor.

**Rules are horizontal only** — one under the header, hairlines between rows, no box and no vertical rules. An
EPUB's tables are often barely tabular, and ruling every cell claims more structure than the content has. A table
that runs past the foot of the page **repeats its header** on the continuation.

Three shapes are deliberately not grids. A **caption** becomes a paragraph above the table, being a sentence about
it rather than a row of it. A **one-column table** becomes paragraphs, because EPUBs use those to center a poem or
a title and a box around a poem is a box around something that was never tabular. And a **row taller than a whole
page** falls back to stacked paragraphs, the escape hatch for the one shape a grid cannot hold. `colspan` is
ignored: a spanning cell occupies one column, which keeps the rest of the row aligned and is a smaller lie than
shifting every cell after it.

### Clickable notes

The end goal, and the reason a PDF rather than an HTML file: a `/Text` annotation — a sticky note — that the
recipient clicks in any PDF viewer to read the comment, rather than commentary printed in the margin. `pdf-lib` can
write the annotation dictionary directly.

The cost to know about: `Rect` is in PDF user space, so the note's position has to be computed from the laid-out
line box, and it has to be recomputed whenever pagination shifts. That is easy while we own the layout, which is
another argument for drawing the text rather than screenshotting it — on a rasterized page there is no line box to
attach to.

Marks are not `/Highlight` annotations: those need `QuadPoints` over real text and would duplicate what is already
drawn. Sticky notes are for the **notes**, where a viewer's own UI adds something the page cannot.

### The outline

A 300-page export has no navigation at all without one: the pages are numbered, which helps someone quoting a
passage back to you and helps nobody trying to reach chapter nine.

`pdf-lib` has no API for outlines, so the dictionaries are written by hand in `pdf-writer.ts`. Three things are
worth knowing before touching that code:

- The structure is a **doubly-linked tree**, not nesting. Each item names its `Parent`, its `Prev`/`Next` siblings
  and its `First`/`Last` children, so every reference exists before the object it points at is complete — hence
  `context.nextRef()` to reserve an id and `context.assign()` to fill it in, rather than `register`.
- `Count` is **signed**: positive opens a branch with that many visible descendants, negative closes it. **Every
  branch is written open**: a collapsed branch hides its entries, and a hidden entry reads as a missing one.
- A bookmark is recorded **when its line is drawn**, from inside the writer's loop, exactly as the marks are. Taken
  by the caller beforehand it would name the page the chapter was about to start on before a page break moved it,
  and nothing on screen would reveal it.

**Depth comes from the book's own heading ranks, and equal ranks are siblings.** Levels are measured relative to
the first entry in each section, so a section always opens a top-level entry whatever rank the book happens to
start at, and one section's headings never fall under the previous section's. `h1`–`h3` only: a sidebar listing
every `h4` is a second table of contents rather than a way of finding a chapter.

**The outline reports the book's structure; it does not impose one.** In a novel in parts the chapters of a part
arguably belong under it — and the outline lists them flat when the EPUB marks `PART II` and `CHAPTER I` at the
same rank. Inferring the nesting would mean reading meaning out of the words "part" and "chapter", which is
guesswork that fails on any book not written in English or not using those words, and which would misreport what
the file actually says. Where a book *does* mark the hierarchy — sections a rank below an `EPILOGUE` heading — it
nests, with no special handling. A wrong outline is worse than a shallow one.

**Nesting by position is wrong too** — treating whatever comes first in a section as the chapter and everything
after it as a subsection. A chapter file that also carries its part's title holds `PART II` and `CHAPTER I` as two
`h2`s, and the part would swallow chapter one.

### Links

**A web address in the book is a working link in the PDF.** `/Link` annotations with a URI action, the same
machinery as the sticky notes. The extractor records linked spans as offsets exactly as it records marks and
emphasis, so all three are one mechanism rather than three that have to agree.

Three things worth knowing:

- **Only links that leave the book.** An EPUB's internal links are relative paths into the archive —
  `chapter3.xhtml#note` — which mean nothing to a PDF viewer, and pointing one at a web address would send the
  reader somewhere that does not exist. The test is foliate's own, deliberately, so the reading surface and the
  export cannot disagree about what counts as leaving the book.
- **One rectangle per line.** A PDF annotation is a rectangle and a link that wraps occupies two; a single
  rectangle spanning both lines would cover the text between them, which is a different sentence.
- **The text is tinted, not underlined.** A clickable region nobody can see is a link nobody clicks — but
  underline is a *mark* treatment here, so a link wearing one would be read as a mark.

The spans are trimmed before use: EPUB source puts a newline and an indent inside the anchor, so after collapsing
the span begins on a space, and both the tint and the rectangle would start a character early.

**Internal links work too**, which matters for a book built from a folder of cross-linked notes: a reference to
another chapter jumps to the page that chapter landed on. Two things make that possible.

**Identity.** An `href` is relative to the section's own place in the archive, and an `id` is unique only within
its own document — `#notes` in chapter two and chapter three are different places. Both are rewritten to
`spineIndex#fragment` in `OrbisReaderView.canonicalizeLinks`, which is **the only code that knows what an EPUB
path is**. It resolves with foliate's own `section.resolveHref` and the same `sectionHrefMap` the rest of the
reader uses. Everything downstream matches plain strings.

**Forward references.** A link to chapter nine has no page to point at when it is drawn, because chapter nine does
not exist yet. So internal links are held in `pendingLinks` with the rectangle and the page they are ON — facts
about where the link *is* rather than where it goes — and turned into annotations at save time, once every
destination has a page. Destinations are recorded when their text is drawn, the same discipline the outline uses.

**Cells are links too.** A contents page built as a table is the shape this feature exists for. A cell's links are
rewritten into keys exactly as a block's are; a raw relative href would match no destination and be dropped as
unreachable — silently, because an unreachable link prints as ordinary text. The mapping lives in `book-links.ts`,
pure and tested, rather than inside the view where it could not be.

**A link into a chapter the reader left out prints as ordinary text.** Chapters are chosen per export, so the
whole set of destinations is gathered before anything is drawn and unreachable links lose their href — otherwise
they would be tinted, promising a click that does nothing.

### Images

Illustrations are embedded, scaled to fit the column and never taller than a page.

**Alignment is read from the book, not chosen.** An EPUB *says* how an illustration sits, and it says it in a
class —

```css
.figcenter { margin: auto; text-align: center }
.figleft   { float: left; clear: left; text-align: center }
```

— so centering everything is right for one and wrong for the other, and it imposes a structure the file never
claimed. `alignmentRules` parses the section's stylesheets for rules setting `text-align` or `float`, and the
DOM's own `matches()` does the selecting, so there is no selector engine here. Inline `style`, the legacy `align`
attribute and a `<center>` ancestor beat a stylesheet, as CSS says they should; the nearest ancestor that says
anything wins, because `text-align` inherits. Specificity is not computed — a later rule wins, which is the same
answer for the flat single-class selectors these files use.

**A book that says nothing gets left**, where the text flow puts an inline image. Gutenberg's covers carry
`.x-ebookmaker-cover` and its plates `.figcenter`, so they center because the book asks, not because we guessed. A
stylesheet that will not load costs the alignment and nothing else.

**Two places a block walk would miss an image**, both silently — `alt=""` is usual, so nothing would appear on the
page to notice:

- **An image inside a block.** A block is collected rather than descended into, and
  `<p class="illustration"><img/></p>` is how a great many EPUBs wrap a picture. Images inside a block come out
  first, then the block's text: a paragraph containing a picture is nearly always a picture with a caption under
  it, and putting the caption first would invert that.
- **The cover.** A Gutenberg cover page is `<svg><image xlink:href="cover.png"/></svg>`. An `svg` is walked for the
  images inside it and for nothing else — its own text content is markup rather than prose.

**A plate is given a fresh page, never a blank one.** A plate is scaled to fit a whole column, so it never fits
what is left of a page; `ensure` declines to turn an untouched page, or every illustration would get a blank sheet
in front of it. The scale also leaves room for the padding the draw then adds, without which a full-height plate
never fits the page it was just given.

**Anything the platform can decode is embedded.** pdf-lib takes PNG and JPEG only, and a note clipped from the web
carries **WebP**, because that is what the web serves. Everything else is redrawn through a canvas
(`pdf-image.ts`), which asks the platform to decode it, and the same engine that displays the book does the
decoding.

Two decisions in that conversion. It draws onto **white**, so transparency flattens to the background the picture
would have been shown against rather than to black. It re-encodes as **JPEG** capped at 1600 pixels on the long
edge, because these are photographs and a lossless copy of a 4000-pixel one makes a PDF nobody can email — the
page column is 484 points wide, so the cap is invisible even in print.

### One chapter list across all four exports

**Every export picks its chapters from one list.** Export to vault, Generate notes, the digest and the
whole-document picker all take their rows from `topLevelChapters`, so one dialog never shows two unrelated notions
of "chapter". Keying the whole-document picker on **spine index** instead would lump chapters: a book whose files
each hold several chapters gets one row per file, so "a PDF of only chapter 1" is not expressible, and a row can
take its name from the running header — the book's title in capitals.

#### The model, which Export to vault already established

`book-extractor.ts` settles each of these questions:

1. **Contents entries are grouped by resolved spine index**, each carrying its anchor — by *index*, not file name,
   because a section id is a path only in EPUB; MOBI, AZW3 and FB2 number theirs.
2. **The spine is walked, not the contents page.** A section nothing points at — a cover, a title page — is taken
   whole under its own name. Walking the contents page instead would give a ticked "Cover" row that writes no
   file.
3. **Slicing is per contents entry at every depth; selection is per top-level branch.** The extractor cuts finely
   and a branch's whole `hrefs` subtree decides what survives. So there is no top-level boundary to compute — only
   chunk→branch membership, which `branchOf` already answers.
4. **A lead-in goes where its words belong** (`leadInGoesTo`; the rule is Save as Markdown's, see book-export.md
   §Sections the contents never lists): the chapter before it, continuing; a piece of its own when it has its own
   heading, keyed per file and kept while any chapter in its file is ticked; or the opening of its file's first
   chapter. It follows the tick of whichever it joined.
5. **An unresolvable anchor**: the first chunk falls back to everything above the first marker; a later one is
   dropped.

#### How the document export follows it

- `ChapterChoice.key: string` is the branch href. Rows come from `topLevelChapters`, plus an `unlisted` row per
  unreached spine section and a row for any entry under no branch — matching `exportRows` case for case.
- Row counts are `heldIn(branch)`, summed over the subtree under the mark filter — the same helper
  `GenerateNotesModal` uses.
- `collectDocumentSections` keeps one `createDocument()` per spine file, then finds each anchor's block through
  **`BookBlock.anchors`** — populated for internal links, so no marker injection is needed here; markdown
  conversion needs markers because it loses element identity, and blocks do not. Chunks are then **concatenated
  back per branch** into one `DocumentSection` per chapter, so the printed headings and outline match the picker.
  Images stay one `Map` per file, shared by its slices.
- `sectionOf` (annotation id → branch href) reuses the digest's `branchOf`.
- There is no `Section N` title fallback: a branch always has a label. `unlisted` rows read their name from the
  section, as `nameUnlistedRows` does for Export to vault.
- **A container holding only text is a paragraph.** Some books write every paragraph as `<div id="Par3">…</div>`,
  and a walk that emitted text only for `p` and its kin would read none of it. A `div`/`section`/`article`/… with
  text and no block or container inside it is a paragraph (`TEXT_CONTAINERS`), and an outer wrapper is still
  descended through so its paragraphs stay separate.
- An unreached section with no name of its own, between two listed ones and holding at least `LABEL_CHARS` of
  text, is the chapter before it continuing — no row of its own, its marks count toward that row
  (`chapterRowsFrom`'s `continues`), and its blocks go into that chapter (`continuationOwner`). The rule is
  `continuationSections` in `unlisted-sections.ts`, asked once by the reader view for every list. A repeated
  unlisted name is prefixed with the contents entry before it (`qualifyRepeatedNames`), as in Export to vault.
- The digest's picker is the same list filtered to `heldIn(branch) > 0` — see below.

The outline has a top-level entry per chapter, and excluding a chapter drops in-book links pointing into it
(`targets` is built from included sections only).

#### Keeping the lists in agreement

**The two lists are checked against each other, not asserted to match.** `chapter-rows.test.ts` runs the real
`exportRows` and the real `chapterRowsFrom` over the spine and nav of the generated fixtures in
`test-vault/fixtures/` and compares keys, unlisted flags and labels. The one permitted difference is pinned: an
unlisted row starts as "Section N" in Export to vault and empty in Save as PDF, both filled from the section's own
heading afterwards.

**Both lists resolve with `hrefToSectionIndex`, never `sectionHrefMap.get(path)`.** That map is keyed by each
section's RESOLVED path, which matches a contents href only in an EPUB; MOBI, AZW3 and FB2 number their sections,
so every chapter would fall through to unlisted. `hrefToSectionIndex` tries the full path, then the basename, then
a scan of the ids, then foliate's own lookup for a Kindle `kindle:pos:` or MOBI `filepos:` link. Where a chapter
starts inside its file comes from `anchorOf`: the href's `#fragment`, or the id of the element a Kindle or MOBI
entry points at, recorded by the location index.

**Two things every cut depends on:**

- **A chapter id usually sits on a container.** Gutenberg writes `<div class="chapter" id="pgepubid00005">` and
  the walk descends through it, so `collect` — which takes ids from the block element and its descendants — would
  record it nowhere. `blocksFromDocument` carries a container's id down to the first block inside it.
- **Cutting happens before `canonicalizeLinks`.** It namespaces every id as `3#pgepubid00005` so a link from
  another section has something unambiguous to point at, so a cut taken after it would search for a bare id that
  no longer exists. Slicing only reads anchors and returns index ranges, so the ranges survive the rewrite.

Either failure is silent: the text all prints, the book's own headings still build an outline, and the only
symptom is a progress number. So the debug log reports the cut counts.

**The progress messages name no unit.** Reading walks spine files, drawing walks the sections those were cut into,
and the picker counts chapters — three different numbers — so they read *Reading N of M* and *Drawing N of M*,
never "chapter".

#### The digest's own picker

The same rows, filtered to the chapters that hold marks, so the list is as long as your reading rather than as
long as the book. **Its own control, not `renderChapters` with a filter**: that one is built around
`chapterScope`, and in a digest `all` and `marked` are the same set — a three-state control where one state is a
lie is worse than a second list.

**The ticks live on the rows**, not in a set of excluded hrefs. `opts.chapters` is built once and only its counts
are recomputed as the mark filter narrows, so `included` is stable state on a stable array and nothing can strand.
A chapter that drops out of view and comes back brings back the answer given for it.

**A row keeps reporting what it holds while unticked** — the per-chapter counts read from the mark filter alone,
or the number telling you what you are giving up empties as you give it up.

**`digestSelection` is one rule used twice**, by the dialog for its summary and its "nothing to write" guard and
by the export for what it writes; two rules is how a summary describes a different file than the one written. It
always keeps a chapter the picker never offered — one whose marks carry no placeable href is keyed on its own
title and has no row, so dropping it would lose marks over a control nobody was shown.

**It appears at one row, where the document's picker hides below two.** That one is right to: its list is the
book's and does not move. This one's moves with the filter, and hiding it would strand the dialog — the ticks
would go on applying out of sight, so unticking a chapter and then filtering down to it would leave an empty
export, Save disabled, and no way back except undoing the filter. Shown enabled rather than disabled for the same
reason.

Three wordings: the header is **"Chapters with marks and notes"**, since a list holding only what contributes
would otherwise claim the book has four chapters, and that phrase is the only one covering an unmarked note as
well as a passage nobody wrote a note on; the summary line has **four whole sentences** because both its numbers
can be one; and the filter's no-mark row is **"Unmarked notes"** (`mark_filter.no_mark`, shared by all three
filters) while `presets.no_mark` stays "Unmarked" for the two places that label a state. A filter row sits beside
real marks wearing color chips, where the bare word names a category rather than saying what choosing it gets you.

### Emoji

**Emoji are drawn as pictures, the way Chromium draws them** (`pdf-emoji.ts`, `emoji-canvas.ts`). An emoji font cannot
be embedded — the color formats are bitmaps or layered glyphs, pdf-lib embeds outlines, and fontkit's subsetter
silently emptied the monochrome ones — so none is. Every emoji is instead a glyph of a Type3 font, a font whose glyphs
are small drawing programs, and each program draws one picture: the emoji drawn on a canvas in the device's own emoji
font, at 96 pixels to the em, with a transparent edge. That is what an Obsidian Export to PDF contains (`Skia/PDF
m150`), read off its bytes. A `ToUnicode` map ties each glyph to its characters, so the emoji copies and searches as
itself — a skin tone, a family joined by zero-width joiners and a flag included, each one glyph.

**By how the character is shown, which is how the reader saw it** (`EmojiFonts.isPicture`). An emoji shown as one by
default — `Emoji_Presentation`: 😀, 📚, 🟡 — or asked for as one, with U+FE0F or as a sequence (a skin tone, a joined
family, a flag, a keycap), is a picture whatever fonts there are: DejaVu Sans has a black 😀, which prints where every
screen shows color and does not copy back out as 😀. A symbol shown as text by default — ♥ © ↩ — is the face's glyph
where a face has one, and a picture only where none does. Anything followed by U+FE0E asked to be text and stays text:
a footnote's `↩︎` back-link, drawn as a picture, came out as an invisible gap. Other characters no face has still
degrade as `sanitizeForPdf` says.

**Measured now, drawn at save.** A line is laid out as it is written, so a picture's width comes from the canvas at
once (`EmojiPictures.measure`); the pictures are drawn when the PDF is saved, one per distinct emoji, into fonts
reserved up front, 255 to a font. A picture keeps its whole grapheme in the cleaned text, so every mark offset after
it still holds. Each looks as it does on the device that made the PDF — Apple's on a Mac and iOS, Google's or
Samsung's on Android — and costs a few KB. Checked on a Mac, an iPhone, an iPad mini and Android.

**Mark badges stay out.** A badge is Markdown's stand-in for color — Generate notes cannot paint a passage — and a PDF
draws the mark itself, in its color and treatment, with the legend naming it. A badge beside that would say twice what
the swatch already says.

---

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Renderer | `pdf-lib`, real text | html2canvas produces images of text: unsearchable, huge, and fatal to mobile memory |
| Platform print | Rejected | Desktop only, and this plugin holds Android/iPad parity as a rule |
| Unencodable characters | Space for a pictograph, else `?`, length preserved | `drawText` throws — the alternative is no PDF at all. Length matters because marks are offsets |
| Font | DejaVu, downloaded on request | Built-in fonts hold ~220 characters; DejaVu's faces cover arrows, mathematics, Greek, Cyrillic and more |
| Font delivery | Download 3.1 MB once, cache on device | Bundling puts it in `main.js` for every user, including those who never export |
| Font integrity | SHA-256 per face, checked on download | CDN bytes end up embedded in a document sent to someone else |
| PDF strings | UTF-16 hex | A note or outline title in Greek is mangled otherwise, and no font can fix it |
| Links | `/Link`, tinted not underlined | Underline is a mark treatment here, so a link wearing one reads as a mark |
| Link identity | `spineIndex#fragment`, resolved in the view | An `href` is relative and an `id` is per-document; the PDF layer should not learn either |
| Forward links | Resolved at save | The destination has no page until it is drawn |
| Emoji | Not embedded | Color formats are not outlines; the monochrome ones subset to empty glyphs, and a badge drawn in line art loses the color that was its meaning |
| Mark in the PDF | Name + color + treatment, no badge | A badge is an emoji, which a built-in font cannot draw |
| Phase one scope | Digest, no EPUB parsing | Everything needed is already in the annotation data |
| Grouping | Chapters in TOC order, entries by CFI | The same ordering rules as reading records, so the two agree |
| A chapter row | A top-level contents entry, plus a row per spine section the contents never reaches | The list Export to vault, Generate notes and the digest already pick from; spine indexes lump several chapters into one row |
| Href resolution | `hrefToSectionIndex`, never `sectionHrefMap.get(path)` | That map is keyed by resolved paths, which only an EPUB's contents matches; MOBI, AZW3 and FB2 number their sections |
| Where a chapter starts | The block carrying the contents anchor, containers included | The id is usually on a wrapping `<div>`, not the heading; and the cut must be taken before `canonicalizeLinks` rewrites every anchor |
| Lead-in above a file's first anchor | The chapter before it, continuing; its own untitled section when it has its own heading; otherwise the opening of its file's first chapter (`leadInGoesTo`) | A flow split can strand a chapter's prose in the next file; a running header or closing line belongs with what follows it, as the recording list reads it |
| A chapter | A top-level contents entry, subheadings nested under it | A mark is filed under the deepest matching entry, which is the right key for placing one and the wrong one for a heading; the same fold a generated note set uses |
| `MarkChapter` shape | Nested `sections`, not a `level` field | `chapters.length` is printed as "across M chapters"; a depth field makes that count two units at once |
| Subheading names | Plain `label`; only a chapter takes `displayLabel` | The parent qualifier tells two `Commands` apart in a flat list, and repeats the chapter's name under the chapter |
| Heading depth in the PDF | Size and weight — bold 13, bold 11 | A PDF has no `##`; the outline `level` comes free from the same call |
| Line breaks in a quote | Kept, always — no re-flow and no switch | Deciding which of an author's breaks were meant is guesswork about a book nobody here has read |
| Included kinds | Passages and notes | Bookmarks are places, not commentary |
| Marks | Optional, on by default, document mode only | A plain PDF of the book is the other thing people want; a digest without marks is nothing |
| Attribution | Optional, set in settings, overridable per export | A name is a fact about you: set it once, where you can find it and clear it |
| Settings vs dialog | Settings are defaults the dialog departs from, never written back | Saving a PDF must not rewrite the settings row you just read. One rule for every export in the plugin is easier to learn than two |
| Destination | Beside the book or a chosen folder, as a setting | The same two-option question the EPUB and reading-records pages ask |
| Cover sheet | On by default, switchable, never on an unmarked export | It carries the legend, which is the only explanation of the marks a recipient gets — but a reviewer returning a draft should not make the author turn past it |
| Outline | Nested by heading rank, `h1`–`h3`, every branch open | Equal ranks are siblings — two `h2`s in one chapter file are two chapters. Nothing collapsed: a hidden entry reads as a missing one |
| Outline hierarchy | Whatever the EPUB marks, never inferred | Reading "part" and "chapter" to build a tree is guesswork that fails on any book not phrased that way, and misreports the file |
| Page size | US Letter, fixed | A size nobody chose beats another question |
| Images | Converted through a canvas when pdf-lib cannot embed them | WebP is what a clipped web note carries, so "PNG and JPEG only" would mean a book with no pictures |
| Image alignment | Read from the EPUB's CSS, left when unstated | The book says, in a class. Centering everything is wrong for `.figleft` and imposes what the file never claimed |
| Tables | Real columns; header repeats; horizontal rules only | A grid is what a table means. Vertical rules would claim structure the content often does not have |
| Table column widths | Proportional, floored at each column's longest word | Proportion keeps a date column narrow; the floor stops `Meaning` being drawn as `Meanin` / `g` |
| Marks in a table | Per cell | Offsets index into one string — shared text draws a highlight in the wrong cell |
| Notes (phase two) | `/Text` annotations | A viewer's own UI beats commentary printed in the margin |
