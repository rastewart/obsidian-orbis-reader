# Book Export System

← [Design Docs](README.md)

## Overview

Book Export extracts the text and images from an open ebook and saves the content as Markdown files in the vault. Implemented in `src/book-extractor.ts` (extraction logic), `src/BookExportModal.ts` (dialog UI), and `src/turndown-rules.ts` (HTML→Markdown conversion).

Entry point: `extractBook(sections, meta, outputPath, options, app)` — dispatches to `extractBookPerChapter` when `options.perChapter` is true.

---

## Technical foundation — `createDocument()`

Every format foliate-js supports exposes a `section.createDocument()` method that returns `Promise<Document>` — a fully-parsed HTML DOM. This is the same DOM foliate-js renders into iframes for display; there is no hidden transformation between what `createDocument()` returns and what the reader shows.

This makes extraction format-agnostic: there is no separate unzipping, binary decoding, or XML parsing in Orbis's extraction code — foliate-js has already done all of that.

```typescript
interface RawSection {
  linear?: boolean;
  size?: number;
  createDocument?(): Promise<Document>;
  unload?(): void;
  resolveHref?: (href: string) => string;
}
```

The `book` object available in `OrbisReaderView` also exposes:
- `book.sections` — flat array of `RawSection` in reading order
- `book.toc` — hierarchical table of contents (`TocItem[]`)
- `book.metadata` — title, author, publisher, language, etc.

---

## Format support

| Format | Text extraction | Images |
|---|---|---|
| EPUB | Fully supported | Paths in the zip → read by foliate's `loadBlob`, through `loadBookBlob()` |
| MOBI / AZW3 | Fully supported | Records → read by `kindleResource` (`src/kindle-resources.ts`), through `loadBookBlob()` |
| FB2 | Fully supported | Base64 data URIs → decoded, then written as files like the rest |
| CBZ | Not applicable — no text content | — |

**A Kindle book's pictures are records, not files.** An AZW3 writes `kindle:embed:0001?mime=image/jpeg`, which
foliate's `loadResourceBlob` reads. A MOBI writes `<img recindex="00001">` with no `src` at all — foliate fills one in
only when it lays a page out — so both exports read the `recindex` (`mobiPictureHref`) and load the record by number,
typing it by its first bytes. Calibre writes an AZW3's cover page as an SVG wrapping the picture by a `kindle:embed`
link, dead outside the book, so the picture inside it is what is exported. Save as PDF loads its pictures the same way.

Non-linear sections (`linear="no"`) are exported like any other. In an EPUB they are covers and contents pages, and FB2 marks its notes body non-linear, so skipping them would lose an FB2 book's footnotes. foliate passes the attribute as the string `'no'`, never `false` — see `RawSection.linear`.

---

## HTML → Markdown conversion

**Library:** Turndown.js, configured in `createTurndownService(includeImages, imageFormat)`.

```typescript
const td = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});
```

**Removed elements:** `<style>`, `<script>`, `<title>`, `<nav>`, `<aside>` are stripped entirely.

**Custom rules:**

| Rule | Input | Output |
|---|---|---|
| Images (wiki, default) | `<img src="vault/path.png">` | `![[vault/path.png]]` |
| Images (markdown) | `<img src="vault/path.png" alt="…">` | `![…](vault/path.png)`, the path URI-encoded — an export named after its book has spaces in its assets folder (`imageEmbed`, shared with the cover) |
| Images disabled | any `<img>` | *(empty)* |
| Superscript | `<sup>text</sup>` | `^text^` |
| Strikethrough | `<s>text</s>`, `<del>text</del>` | `~~text~~` |
| Tables | `<table>` | a Markdown table — see *Tables* below |
| Links | `<a href>` marked by `ExportLinks.mark` | a placeholder around its text, filled in after every note exists — see [Links](#links) |
| Links (unmarked) | any other `<a>` | its text |

**Tag-like text is escaped.** Turndown escapes Markdown's syntax but never `<`, so a book's words that look like HTML would reach the note raw and Obsidian would parse them: an unclosed `<script>` line in running text opens an HTML block that runs to the end of the note, hiding every heading after it from Obsidian and breaking every link to them. `createTurndownService` wraps `escape` so a `<` followed by a letter, `/`, `!` or `?` becomes `\<`; code blocks never pass through it. Programming books print such text outside code, and some fiction uses angle brackets as punctuation in dialogue.

**Tables** (`tableMarkdown`). A table of two or more columns becomes a Markdown table, rebuilt from its own rows with each cell converted on its own, so its links, emphasis and images come out as anywhere else. The other shapes follow the PDF's reader (`tableBlocks`, book-blocks.ts): a caption is a paragraph above the table, a one-column table is its cells as paragraphs — books use those to center a poem or a title — and a table inside a cell is that cell's text. **Every row is as wide as the widest**, a merged cell padded with empty cells where it spread so the cells after it keep their columns. **A cell is one line**: paragraphs join with `<br>`, a `|` is escaped, and block markers a cell would show as text go — a quotation keeps its words, a heading turns bold. **The header row is the book's own or empty**: a Markdown table must have one, few books mark one (a row of `th`, or a `thead`), and promoting the first row would call it a header the book never did. A wiki link inside a table is written `[[note\|text]]`, since its `|` would end the cell; a footnote cited from a cell takes its block id on a line after the table.

**Code written as paragraphs stays paragraphs.** A programming book converted by Calibre can write each code line as a `<div>` that keeps its spaces through the stylesheet (`white-space: pre-wrap`), with no `<pre>` and no `<code>`. Those lines come out as paragraphs, and runs of spaces collapse. Reading the stylesheet's `white-space` as "code" is refused: books set it on their body text too, and a novel styled that way would become one long code block.

**Post-processing:** `collectImages()` rewrites `<img src>` attributes to vault paths *before* Turndown runs — so Turndown only sees the already-resolved path.

**Title deduplication:** `stripLeadingDuplicateTitle(content, chapterTitle)` removes the first paragraph of a section if it closely matches the chapter title (a common epub artifact where the chapter heading appears both in the TOC and as an opening `<p>` in the content). Applied only to the first section of each chapter.

**Empty section handling:** Sections that produce no Markdown after conversion are silently skipped.

---

## Image extraction

`collectImages()` is called per-section before Turndown runs. It:

1. Queries all `<img>` elements in the DOM.
2. For each image with a non-data-URI `src`, calls `section.resolveHref(src)` to get the absolute epub href, then fetches the blob via `loadBookBlob(absHref)`.
3. For data URIs (FB2), decodes the base64 content directly.
4. Writes binary files to the assets folder as `img-001.png`, `img-002.png`, etc. (MIME type determines extension).
5. Uses `hrefCache: Map<string, string>` across all sections so the same epub resource is fetched and written only once.
6. Mutates `<img src>` to the saved vault path so Turndown picks up the correct path.

**Assets folder location:**

| Mode | Assets path |
|---|---|
| Single file | `{outputDir}/{baseName}-assets/` |
| Per-chapter | `{baseFolder}/assets/` |

---

## Sections the contents never lists

**A section no contents entry lands in is a chapter of its own — unless it is the chapter before it continuing.** Publishing software splits long chapters across files, and the later pieces carry no name of their own: no heading, the book's title as a running header, the chapter's own name again (some books open each chapter in the file after its listed title page, under the same heading), or Calibre's generated `Continued, <book>` / `Unknown`. Such a section, between two listed sections and holding at least `LABEL_CHARS` of text, joins the chapter before it: `collectByTocAnchors` appends it to the last piece (`collectContinuation`) and it follows that piece's selection; the dialog lists no row for it. The rule is `continuationSections` in `src/unlisted-sections.ts`, asked once by `OrbisReaderView.sectionContinues` and passed to the extractor as `continuesSection`, so the export, its dialog, Save as PDF and the recording list cannot disagree about it.

An unlisted section with a real heading stays a chapter. Front and back matter are left alone — a nameless unlisted section at the back can be an excerpt of a different book. So are scraps under `LABEL_CHARS`: a half-title would otherwise become a moment-long part of another chapter.

**Text above a file's first anchor — the lead-in — goes where its words belong**, one of three ways:

- **The chapter before it, continuing**, when that chapter was anchored partway down its own file (one that owns a whole file cannot be sitting in the next), the text is longer than `LEAD_IN_CHARS` (a running header is not a chapter), and it has no heading of its own. A flow split can land mid-chapter: Project Gutenberg's layout can end a file on a chapter's heading and open the next with that chapter's prose. Taken as a piece of its own and named for the file's first heading, the prose was filed under the next chapter's name — a note called *PART II* holding *CHAPTER III*, and *CHAPTER III* left an empty heading in the contents note. It follows that chapter's tick.
- **A piece of its own**, when it opens with a heading of its own: named by the book, as a named unlisted section is — Gutenberg's boilerplate header above the title page. It is kept while any chapter of its file is ticked.
- **The opening of the file's first chapter**, otherwise — a running header, or the "END OF THE EBOOK" lines above Gutenberg's license. As a piece of its own it took the name of the heading after it, and the license came out as two notes with one name.

A link into a lead-in lands on the note it went into. The recording list reads lead-ins the same way (`splitLeadIns`, `book-chapters.ts`, whose threshold this shares), and Save as PDF asks the same question of its blocks (`leadInGoesTo`), so all three put a chapter's words in the same place.

**A repeated name is prefixed with the contents entry before it** (`qualifyRepeatedNames`): a book's repeated "Summary" rows become `1. First Steps – Summary` and so on, and the qualified name reaches the note name, the single note's heading and the recording's track. All or nothing per name, as `flattenTocWithDisambiguation` does for the contents' own labels.

---

## Links

`src/export-links.ts`. **The rule: a link to the web, to a chapter, or to a heading Obsidian will land on — unique in its note, or the first of its name there — comes over; any other link becomes its text.** Obsidian can land on a note, a heading or a block, and an EPUB anchor sits on anything — a bare `<a id>`, a `<div>`, a `<p>` — so a link partway into a paragraph has nothing to point at. Obsidian sends a link to a repeated heading to the *first* one, so a link to a later copy would land in the wrong place, silently; a link to the first is exactly right. "First" is counted per piece in a book folder (`Target.firstInPiece`) and across the book in a single note (`firstInBook`), where Orbis's own `#` chapter headings also count; anything uncertain makes a target look later, never earlier, so it falls to text. Heading text is compared as Obsidian compares it (`headingKey`, mirroring Obsidian's `stripHeading`): ASCII punctuation becomes a space, whitespace collapses, case is ignored — so `Hooks` and `Hooks:` are one heading, and a non-breaking space in `1.&nbsp;First Steps` matches an ordinary one.

**A later copy in a single note gets a heading path**: `[[#3. Working with Services#Hooks|Hooks]]`. Obsidian's `resolveSubpath` finds the first heading matching the first part, then the first DEEPER heading after it matching the next — it does not stop at the end of a section, so the path is written only when it lands exactly: the Orbis chapter heading is unique or the first of its name, stands above one piece, the target is the first of its name in that piece, and the target is deeper than `#`.

**An Orbis chapter heading may not share a name with a book heading earlier in the note**, or a link to the chapter lands on the book's heading — an unlisted *Secure Relay* section after an earlier chapter's `#### Secure Relay`, say. `singleNoteChapterHeadings` decides the single note's chapter headings once every chapter's text is known, and prefixes a colliding one with the contents entry before it (`4. Running a Server – Secure Relay`). A book folder needs none of it.

| The link points at… | Book folder | Single note |
|---|---|---|
| A web address (`http`, `https`, `mailto`, `ftp`) | `[text](url)` | same |
| The start of a contents entry, at any depth | `[[006 - PART I – CHAPTER I\|text]]` | `[[#PART I – CHAPTER I\|text]]`, if that heading is unique in the note or the first of its name there (`HeadingOrder`) |
| A heading inside a chapter — unique in its note, or the first of its name there | `[[006 - PART I – CHAPTER I#Heading\|text]]` | `[[#Heading\|text]]` |
| Anything else — a paragraph, a missing `id`, a chapter not exported | its text | its text |

Written in the **Link format** setting's style: `markdown` gives `[text](006%20-%20PART%20I.md#Heading)`. **A colon in a Markdown link's heading is written as a space** (`markdownSubpath`): Obsidian reads a destination containing a colon, such as `(#CHAPTER%206:%20THE%20TITLE%20LINE)`, as a web address, draws the external-link icon and cannot open it. `%3A` would depend on Obsidian decoding it before the lookup; a space is what `headingKey` turns a colon into anyway. Only a single note is affected, since a folder links to file names and those never hold a colon.

**Two passes, because a link can point forward.** A section is converted before later sections are opened, so nothing yet knows what note a later chapter becomes or whether a heading will be unique. During conversion, `mark` gives each `<a href>` an id and Turndown writes a placeholder around its text; `index` records where every `id` in the section lands — its piece, whether anything but whitespace precedes it there, and the heading it is on or directly above. After every note's name and text exist, `PieceNotes.render` fills the placeholders. **Nothing is added to the book's text** except the block ids a Notes chapter's back-links need (see *Footnotes* below); otherwise only a link's markup is replaced.

- **A piece is `splitSectionMarkdown`'s piece.** `index` walks the document in order and switches piece at the same split markers, with the same rule for the lead-in (see *Sections the contents never lists*): the chapter before it, the file's first chapter, or a piece of its own, whichever it went into. An `id` in a piece that turns out to have no text belongs to the next one, which is why a link to a bare file lands on the chapter its first anchor opens.
- **Every contents entry is a chapter start**, not only top-level ones: the export makes a note per entry (`bookTocFlat` flattens every depth).
- **A divider** — an entry with no text of its own — writes no note and no heading, so a link to it lands on the chapter it opens. One definition, `PieceNotes`, serves both formats.
- **Not a link inside a heading.** The heading must stay plain to be linkable, and the commonest case — a chapter title linking back to the contents page — reads fine as text.
- **A heading is linked only when its text has nothing Obsidian or Markdown would change** — no square or angle brackets, `#`, `|`, `^`, backslash, `*`, `_` or backtick. The heading's text is taken from the export's own Turndown, so it is what the note contains.
- **Only four schemes become links.** `isExternalHref` is any scheme; `javascript:` and the rest stay text.

### Footnotes

`src/export-footnotes.ts`, driven by `ExportLinks`. **A book's footnotes and endnotes become Obsidian footnotes**: the reference is `[^1]`, the note's text is `[^1]: …` at the end of the note holding the reference, and Obsidian shows it on hover. Always on; there is no setting, for the same reason links have none — it is the book's structure carried over.

**What counts.** A reference is a short link — a number, a letter or a mark, or one typed `noteref` — that does not open its own paragraph; one that does is a notes list's label pointing back into the text, and is left alone. **It becomes a footnote only with evidence** that its target is its note: the note links back to it, the note opens with the reference's own label, or the book types either end as a note. Without evidence it is an ordinary link, and its target stays where it was — so a textbook's cross-references and an index's page links are never mistaken for notes.

**Two passes, like the links.** During conversion `mark` records each candidate reference and fences each block that could be a note — one a reference already points at, or one that opens with a label-shaped link (so a note met before its reference is still found). The fence is text in private-use characters (`export-placeholders.ts`), not a Turndown rule, so a block nobody cites converts exactly as it would unfenced, and only the fence comes out. `index` skips fence-only text, or a fence at a piece's top would make every target after it look partway down. On the first `PieceNotes.render`, `gather` reads every note's Markdown out of every note's text — possible because `PieceNotes.text` has seen all of them first — and decides which references have evidence.

**A note continues into the blocks after it only while they are styled as it is**, and stops at the next note, a heading or a blank. Some books name each chapter in their Notes chapter with a styled paragraph (`<p class="h2b">`), not a heading; without the style check each chapter's name would become the last paragraph of the note before it.

**Where the book's own copy of the note goes depends on where the book kept it:**

| The note is… | The book's copy | Links back to the text |
|---|---|---|
| In the same file as its reference, or the same chapter (a book with each file's notes at its end) | Removed — the footnote list lands in the same place | The footnote's own ↩ |
| In another file **and** another chapter (a book-wide `NOTES` chapter) | Kept where the book put it | The note's number, to a block id on the citing paragraph |

Both halves of the test are needed. A file alone is not enough, since a Calibre split can put a chapter's notes in the next file, which continues the same chapter. A chapter alone is not enough either: a file that holds several contents entries, with its notes at its end, puts them in the last of those entries, and kept there they would be a list of other chapters' notes.

**A block id per citing paragraph** — `^fn-1`, `^fn-2`, numbered within each note — is the one thing an export adds to the book's text. Obsidian can land on a note, a heading or a block, and the reference sits mid-paragraph; the paragraph is the closest place. Two references in one paragraph share its id. A list or quote takes the id on the line holding the reference, a table on a line after it. The Notes chapter's number becomes `[[007 - CHAPTER 1 THE TITLE LINE#^fn-1|1]]` (`[[#^fn-1|1]]` in a single note; `[1](007%20-%20….md#%5Efn-1)` as Markdown — the encoded `^` resolves). **In a single note both copies stay, deliberately**: Obsidian's footnote list is flat and renumbered, and only the book's Notes chapter keeps its grouping, its numbers and a link back from every entry. Writing the definitions in the Notes chapter's place, or removing it, would lose that; the cost is each note's text twice in one file.

**Labels.** The book's own label when it is letters and digits, `n1`, `n2` otherwise. In a single note a repeated label gets a suffix — `[^1-2]` — because most books number each chapter's notes from 1. Reading view renumbers footnotes in order anyway; Live Preview and source show the label.

**Carets.** A superscript holding only a reference is the reference, so its `^…^` goes. Those are dropped before any other link is rendered: in one pass, a link just before the superscript — a chapter title's own — would take the opening caret and leave `THE TITLE LINE^[^1]`.

**Save as PDF needs none of this.** A PDF can put a destination on any `id`, so the book's references and back-links already work there as the book has them.

---

## Output modes

### Single file

```
{parentFolder}/
  {exportName}.md
  {exportName}-assets/
    img-001.png
    img-002.jpg
```

File structure:
```markdown
---
title: "Book Title"
author: "Author Name"
publisher: "Publisher"
language: "en"
export_date: "2025-06-13"
---

# Chapter One

Chapter content…

# Chapter Two

More content…
```

**No contents list of the export's own.** Most books print a contents page at the front, and it comes over as part
of the book's text, its links rewritten to the note's chapter headings (see Links). A list written by the export
would repeat it, so most single notes would open with the same information twice. A book with no printed contents
page, such as `parts-and-chapters.epub`, has none in the note; Obsidian's Outline lists the `#` chapter headings. The
book folder differs because its chapters are separate files and need the contents note to reach them, and Generate
Notes' single note differs because it holds annotations, not the book's text, so it has no contents page to repeat.

**Out of the vault.** **Export…** on a computer and **Share…** on a phone or tablet send this one note out of the
vault instead of writing it (`ExtractOptions.deliver`, `outside-vault.ts`). A wiki link and an image embed mean
nothing anywhere else, so the note is written for elsewhere: links inside it are standard Markdown links to
GitHub-style anchors (`githubSlug`), images are left out — they are separate files, and what leaves is one — and
`book` names the book's file in plain text. What only Obsidian can reach falls to text, by the same rule as every
other link here: a later copy of a repeated heading, which needs Obsidian's heading path, and the block ids a book's
notes chapter links back through. GitHub's anchors are the most widely followed; an editor that slugs headings
differently will miss some links, which the reader accepted for a copy made to leave Obsidian.

### Per-chapter (book folder)

```
{parentFolder}/
  {exportName}/
    000 - Book Title.md       ← MOC
    001 - Chapter One.md
    002 - Chapter Two.md
    assets/
      img-001.png
```

**MOC file** (`000 - {sanitized title}.md`):
```markdown
---
title: "Book Title"
author: "Author Name"
publisher: "Publisher"
language: "en"
export_date: "2025-06-13"
---

# Book Title

- [[001 - Chapter One]]
- [[002 - Chapter Two]]
```

**Chapter file** (`{NNN} - {sanitized chapter title}.md`):
```markdown
---
title: "Book Title"
author: "Author Name"
chapter: "Chapter One"
prev: "[[000 - Introduction]]"
next: "[[002 - Chapter Two]]"
export_date: "2025-06-13"
---

Chapter content…
```

**A divider in the contents note** — a piece holding only its title, which writes no note — is a `##` heading over what follows when the book's contents list it (PART II, EPILOGUE), several in a row joined with ` · `, and a bold line in its place when they do not (`contentsNoteList`). A Markdown heading covers everything to the next heading, and an unlisted page saying only "NOTES", before one novel's glossary, became a heading over the two novels after it: the book never says what such a page covers, so the note does not claim it.

Chapter filenames are zero-padded three-digit index (`001`, `002`, …) followed by the sanitized chapter title (max 80 characters, special path characters removed). When a chapter spans multiple spine sections, their content is concatenated in reading order.

---

## Export dialog (`BookExportModal`)

Triggered via the `...` toolbar menu → **Save book as Markdown**.

| Field | Type | Notes |
|---|---|---|
| Export as | Radio | Single file / Book folder; defaults from settings |
| Save in | Folder dropdown | Defaults to plugin setting |
| File name / Book folder | Text input | Defaults to the book's title, or its file name when it has none; emptied, it shows that default as a hint and uses it (see dialog-system.md) |
| Path preview | Read-only | Updates live as fields change |
| Include images | Checkbox | Defaults to the Include images setting |
| Chapters | Scrollable checklist | Only shown in Book folder mode; All / None quick-select |

**File/folder exists:** When the target path already exists, the dialog shows a conflict option:
- Save as new version (default) — appends `-1`, `-2`, etc. until the name is unique
- Replace — overwrites the existing file or folder

The link format (wiki vs. Markdown) is not exposed in the dialog; it is set in **Settings → Conversions → Save as Markdown**, as **Link format**. It decides how images and the book's own links are both written — see [Links](#links).

---

## Settings

Managed in `OrbisSettings` under **Conversions → Save as Markdown**. All fields but the first are in
`OrbisPluginSettings.bookExport`. The first is top-level, beside the PDF pair it matches: settings load merges defaults
one level deep, so a field added to `bookExport` would be missing from every vault saved before it.

| Setting | Type | Default | Description |
|---|---|---|---|
| `markdownSameFolderAsBook` | boolean | `true` | The Save to field starts in the book's folder; `false` starts it in `defaultExportFolder` |
| `defaultExportFolder` | string | `""` (vault root) | The Save to field's folder when `markdownSameFolderAsBook` is off |
| `perChapter` | boolean | `true` | Default export mode |
| `includeImages` | boolean | `true` | Default for Include images |
| `imageFormat` | `'wiki' \| 'markdown'` | `'wiki'` | Image link style in exported Markdown |

---

## Key decisions

| Decision | Choice | Reason |
|---|---|---|
| DOM source | `section.createDocument()` | Format-agnostic; foliate-js handles all parsing; no extra dependencies |
| Image naming | Sequential `img-NNN` | Blob URLs and data URIs have no stable filenames; sequential names are predictable |
| Image deduplication | `hrefCache` across sections | Ebooks frequently reference the same image (e.g., decorative dividers) from multiple chapters |
| Non-linear sections | Export them | An FB2 book's notes body is non-linear; in an EPUB they are covers and contents pages |
| MOC filename prefix | `000 - ` | Sorts before numbered chapter files in any file explorer |
| Title deduplication | `stripLeadingDuplicateTitle` on first section | Ebooks commonly repeat the chapter title as the first `<p>`; stripping avoids double headings in output |
| Per-chapter assets | `{folder}/assets/` shared | One image folder per book is simpler to navigate than one per chapter |
| Single-file assets | `{name}-assets/` sibling | Keeps the book file and its assets together without nesting |
| Single-file contents list | None written | Most books print a contents page, which the note keeps; a second list would repeat it |
