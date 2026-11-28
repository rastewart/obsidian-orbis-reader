# Test fixtures

Every book here is generated. None is a real book, and no real title, author or passage appears in any of them: the prose is invented, the author is the invented Orbis Tester, and each book's title is its file name in words. The one exception is `cafe-and-co`, whose title and author, *Café & Co.* by the invented Zoë Lefèvre & Søren Ågård, are there for their `&` and accented letters. Each book also says what it is: its publisher is *Orbis Reader test fixtures*, its description says it was made to test Orbis Reader and is not a real book, and its cover reads ORBIS READER TEST BOOK (`scripts/fixtures/marker.ts`). The books reproduce the structures real books have — how a contents page is shaped, which files it reaches, where notes live — because those are what the code is written against.

## Rebuilding

`pnpm build:fixtures` writes the books, their Library title notes and covers in `library/`, the sample notes in `notes-to-epub/`, and `src/__tests__/fixtures/book-shapes.json`, which `chapter-rows.test.ts` reads. A rebuild is byte-identical, so running it on an unchanged generator changes no file.

The generator is `scripts/build-fixtures.ts`. The books are in `scripts/fixtures/books.ts` (what the automated tests and the manual test plans use) and `scripts/fixtures/findings.ts` (one shape each that a real book taught the code). The comment above each book says what it covers and what to check.

Three books have builders of their own: `hostile-scripts.epub` (`pnpm build:hostile-epub`), and `stylesheet-checks.epub` and `stylesheet-hazards.epub` (`pnpm build:stylesheet-epub`). Each reports on itself when opened.

`stylesheet-checks.epub` embeds one font that Orbis did not make: Pacifico, a brush script, under the SIL Open Font License. Its license is inside the book (`OEBPS/fonts/OFL.txt`) and beside the font in `scripts/fixtures/fonts/`.

## The Kindle files

Nothing in JavaScript writes MOBI or AZW3, so four books are converted with Calibre's `ebook-convert` and committed as they came out:

| File | Convert | Command, in `test-vault/fixtures` |
|---|---|---|
| `annotation-workhorse.mobi` | `annotation-workhorse-convert-to-mobi.epub` | `ebook-convert annotation-workhorse-convert-to-mobi.epub annotation-workhorse.mobi --mobi-file-type old` — a MOBI 6 file with no KF8 part |
| `parts-and-chapters.azw3` | `parts-and-chapters-convert-to-azw3.epub` | `ebook-convert parts-and-chapters-convert-to-azw3.epub parts-and-chapters.azw3` |
| `technical-book.azw3` | `technical-book-convert-to-azw3.epub` | `ebook-convert technical-book-convert-to-azw3.epub technical-book.azw3 --pubdate "0101-01-01T00:00:00+00:00"` |
| `cafe-and-co.mobi` | `cafe-and-co-convert-to-mobi.epub` | `ebook-convert cafe-and-co-convert-to-mobi.epub cafe-and-co.mobi --mobi-file-type both --pubdate "0101-01-01T00:00:00+00:00"` — a MOBI 6 and a KF8 part; foliate opens the KF8 |

`pnpm build:fixtures --calibre-sources` writes the EPUBs to convert: each is its book with a cover naming the target format. Convert each, check the result, and delete the `-convert-to-` EPUBs. Convert again whenever a source book's text, title or metadata changes.

The technical book and *Café & Co.* have no publication date, and `--pubdate` keeps it that way: Calibre's command line otherwise stamps the day of the conversion, which the Library would then show. The value is Calibre's own "undefined", as its desktop app writes it.

## The books

| Book | What it is for |
|---|---|
| `First-Open.epub` | First-open tests: twelve chapters, long enough to watch the location index build, and a mixed-case file name |
| `annotation-workhorse.epub`, `.mobi` | Navigation, display, annotation and data tests: 26 chapters under one title heading, over five files |
| `parts-and-chapters.epub`, `.fb2`, `.azw3` | One book in three formats: PART I–VI with `CHAPTER I`… repeating in every part, and an epilogue with two sections |
| `volumes.epub` | Volumes nested two deep, chapter numbering restarting per volume, unlisted image pages at the end |
| `calibre-split.epub` | A Calibre EPUB 2: `index_split_NNN` files, contents out of spine order, one `#filepos` fragment |
| `running-header.epub` | More than 30 top-level entries in 7 files, a running header with the next item nested under it |
| `numbered-chapters.epub` | `N Name` chapters, one per file, and a `(contd.)` pair |
| `converted-note.epub`, `converted-folder.epub` | Made by Orbis's own converter from notes: one note, and a folder of 39 |
| `fb2-sample.fb2` | An FB2 with a series and a maker's nickname |
| `sample-comic.cbz` | A comic with no metadata and a landscape first page; pages 2 to 6 show their number large, so a page turn shows where it landed |
| `cafe-and-co.epub`, `.mobi` | *Café & Co.*: an `&` and accented letters in the title, author and contents, so the MOBI's metadata and contents go through foliate's character-reference decoding |
| `long-chapter.epub` | Listening: a 79-minute chapter divided into three tracks, between two chapters of three minutes to record |
| `no-contents.epub` | Listening: four files of text, no headings and an empty contents, so each file is a track of the book |
| `speech-sampler.epub` | Listening: one chapter for each way the text is rewritten before a voice reads it — capitals, initialisms, headings in capitals, dotted forms, Roman numerals, web and email addresses — for hearing how each is read |
| `page-numbers.epub` | Page numbers from an EPUB 3 page list: roman front matter, a gap at page 17, breaks partway through a paragraph and a sentence, a chapter starting partway down page 24, a chapter wholly on page 31, an index on pages 40–41 citing real pages, and an unnumbered `[42]` |
| `page-numbers-ncx.epub` | Page numbers from an EPUB 2 NCX `<pageList>`, with no nav document |
| `broken-page-list.epub` | A page list whose targets are all missing, so the book has no page numbers |
| `keyword-sizes.epub` | Body text sized with `small`, `x-large` and the other keywords |
| `body-text-styles.epub` | A book that justifies, line-spaces and sets fonts on its own paragraphs, beside centered lines and code |
| `gutenberg-style.epub` | Project Gutenberg's layout, with a placeholder publisher in its boilerplate |
| `calibre-body-anchors.epub` | Every contents entry on a `<body id>`, with continuations Calibre writes |
| `omnibus.epub` | Three novels in one book, with nameless continuation files |
| `trilogy-parts.epub` | Three novels in one book whose titles sit beside their parts in the contents, each part holding the chapters |
| `technical-book.epub`, `.azw3` | Paragraphs and code lines written as `<div>`s, repeated section names, tag-like text, and a diagram inside a chapter |
| `endnotes.epub`, `footnotes.epub`, `fb2-notes.fb2` | Notes in a Notes chapter, at the end of each chapter, and in an FB2 notes body |
| `hostile-scripts.epub` | A book that tries to run code; every check reads PASS if none ran |
| `stylesheet-checks.epub`, `stylesheet-hazards.epub` | Books whose own CSS says whether their stylesheets arrived; `stylesheet-checks.epub` also carries its own font, plain and obfuscated |

## Other folders

- `library/` — Library title notes and covers for some of the books, covering every reading status, a rating, both date forms, `kind` and the older `type`, and one work held on two notes.
- `notes-to-epub/` — sample notes for Save note as EPUB, the two folder modes and Read in Orbis Reader. What converting them writes is not committed.
- `resilience/` — scratch books for the Orbis file and resilience test page, which moves, renames, deletes and damages them: `Workhorse Copy.epub` (a copy of `annotation-workhorse.epub`, with a space in its name), `First-Open.epub`, `empty.epub` (no bytes) and `not-a-book.epub` (a line of text). Copied into the vault the page runs in, never used in place.
- `sync/` — `othertest1-device.json`, another device's published record, for the Sync test page to copy into a folder under a name sync reads (`orbis-sync.devices.othertest1.othertest1.json`). Stored under a name sync ignores, so the page's reset does not trash it.
- `!orbis-data/` — what reading the books writes: positions, marks, page caches and recordings. Not committed, so every book starts fresh.
