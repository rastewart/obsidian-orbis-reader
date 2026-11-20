# foliate-js in Orbis Reader

This folder is [foliate-js](https://github.com/johnfactotum/foliate-js) by John Factotum, MIT licensed (`LICENSE`),
vendored into Orbis Reader on 2026-09-25. Every way it differs from upstream is listed here. Orbis imports it as
`foliate-js/…` through `"foliate-js": "link:./src/vendor/foliate-js"` in the root `package.json`, so the imports read
as they did when it came from npm.

## Where it came from

Until 2026-09-25 Orbis installed `foliate-js@1.0.1` from npm. That package is **not an upstream release**: upstream
never publishes to npm and never tags. It was published by a third party (`shmandadi`) on 2025-04-21, and it is
upstream commit [`052123b`](https://github.com/johnfactotum/foliate-js/commit/052123beafed921a9a2a45ef6330c235289a634e)
(2025-03-29, "Add an EventTarget for transforming the book") plus that publisher's own changes. The base was found by
scoring every upstream commit against the npm files; `052123b` was the closest by a clear margin.

It came here in two steps, on the same day:

1. **Vendored, behavior unchanged.** The npm 1.0.1 files, byte for byte, plus Orbis's five patches. A production
   `main.js` built from this folder was byte-identical to one built from the npm package and its build-time patches.
2. **Merged with upstream through
   [`78914ae`](https://github.com/johnfactotum/foliate-js/commit/78914ae) (2026-05-01)**, the latest upstream commit:
   30 upstream commits since `052123b` touch the kept files. Each file was merged three ways (base `052123b`, ours,
   upstream). Every one merged without overlap except `vendor/zip.js`, a single minified line both sides had
   rebuilt, where upstream's build was taken. What the merge changed, and the two patches it made necessary, are
   below.

**Merged through: `78914aef4466eb960965702401634c2cb348e9b1`** (`78914ae`). The next merge starts there.

**The two bundles under `vendor/` are upstream's at that commit, byte for byte**, and nothing in this folder changes
them. Their SHA-256s, to check a copy against or to tell whether a merge changed them:

| File | SHA-256 |
|---|---|
| `vendor/fflate.js` | `e63bcc21f83a43e5f71d5cbefd351ff4d4dbd57bef8b29ad65c8bd65752f6e6b` |
| `vendor/zip.js` | `2a0d43157e4a447c6e43351225758795b75a33e8dfec10c6767248df2182949a` |

**Kept:** the files `view.js` reaches (`comic-book`, `epub`, `epubcfi`, `fb2`, `fixed-layout`, `mobi`, `overlayer`,
`paginator`, `progress`, `search`, `text-walker`, `tts`, `view`, and `vendor/fflate`, `vendor/zip`). That set imports
nothing outside itself except `construct-style-sheets-polyfill` (from `fixed-layout.js`), which is therefore a direct
dependency in the root `package.json`.

**Left out**, since Orbis never loads them: `dict.js`, `footnotes.js`, `opds.js`, `quote-image.js`, `uri-template.js`,
`reader.js`, `reader.html`, `ui/`, `tests/`, `rollup/` and the build configs. Upstream's `pdf.js` and `vendor/pdfjs/`
were already gone from the npm package, and `view.js` has PDF detection removed to match. Orbis opens no PDFs.

## The npm publisher's changes, against `052123b`

Whether Orbis relies on each one is recorded, because a merge from upstream has to keep the ones it does.

| File | Change | Orbis |
| --- | --- | --- |
| `overlayer.js` | `constructor(doc)`; a Safari zoom correction on client rects; `#splitRangeByParagraph`, so a range's rects are gathered paragraph by paragraph | **Relies on it.** `view.js` constructs it with the document. The split itself is replaced by patch 15 |
| `overlayer.js` | A `padding` option on every shape, and underline/strikethrough/squiggly offsets moved by half the stroke | Inert: Orbis passes no `padding`, and draws its own underline (`reader/mark-draw.ts`) |
| `paginator.js` | A `containerPosition` getter and setter | **Relies on it**: 17 uses across `OrbisReaderView`, `ReaderDom`, `SearchController` and `tts/page-follow` |
| `paginator.js` | Each column gets its own background (`#replaceBackground`, honoring a `--theme-bg-color`); the document's own background is cleared | Part of today's rendering |
| `paginator.js` | Vertical writing uses `margin` for its column gap and padding | Part of today's rendering. Orbis patches 3 and 3b are written against these lines |
| `paginator.js` | A swipe is ignored while text is selected; a swipe moves along its dominant axis only | Part of today's gestures |
| `paginator.js` | `prev`/`next` are `async` and page turns report `!atStart`/`!atEnd`; the container exposes `part="container"`; a re-render after layout | Part of today's behavior |
| `epub.js` | Calibre's `%2c` decoded to a comma; relative URLs under an `OEBPS` base not treated as absolute; a cover found by filename when the manifest names none; a package with no Dublin Core elements no longer throws | Part of opening books |
| `comic-book.js` | ComicBookInfo metadata read from a CBZ's zip comment | Active for CBZ |
| `text-walker.js` | A null text node reads as empty | Active |
| `fixed-layout.js` | Imports `construct-style-sheets-polyfill` | Active; hence the dependency |
| `vendor/zip.js` | Rebuilt (re-minified) from a newer `@zip.js/zip.js` 2.7; same exports | **Superseded** by the merge: upstream's own build, from zip.js 2.8.22, same four exports |
| `view.js` | PDF support removed; `exportparts` adds `container` | Harmless |
| `tts.js`, `footnotes.js` | Abbreviation-aware sentence merging; footnote ranges and a `follow` flag | Carried only: Orbis has its own read-aloud and footnote handling and calls neither. `footnotes.js` is not vendored at all |

## What the upstream merge brought in, and what was checked

The 30 commits, grouped, with what each group was checked against. Nothing listed here was altered except where
patches 6 and 7 say so.

| Area | Change | Checked |
| --- | --- | --- |
| MOBI / AZW3 | Multibyte characters in fragment selectors (`decode(raw.slice(off))`, not `decode(raw).slice(off)`); empty fragments; anchors built before the first section is cached; much faster text sectioning; a KF8 `transformTarget` | The fixes are why the merge was done. The `transformTarget` hook brought in a regression, fixed by **patch 7** |
| EPUB | `srcset` images resolved; several publishers kept, not just the first; a `pageBreakSource` property; manifest lookups by id through a `Map`; a `load` event on the book for every item | `publisher` is now a list: the reader flattens metadata through `metadataText`, which joins lists, so one publisher reads as before. The `load` event reversed the script default, restored by **patch 6** |
| Positions (`epubcfi.js`) | A text node inside a `FILTER_SKIP` wrapper keeps its offset | Runs only when a filter is passed. `view.js` calls `CFI.fromRange(range)` with none, and so does every Orbis call, so no saved highlight, bookmark or reading position changes |
| Paginator | An animation finishes at once when the page is hidden; a `null` selection no longer throws | Neither touches what `ReaderDom.ts` wraps |
| Fixed layout | RTL transform anchor, spread index, single-page re-render, a missing blank-page size, `this.side` → `this.#side`, an empty viewport ignored | Fixes only |
| CBZ | Pages sorted numerically (`page10` after `page9`); each page a full HTML document | A CBZ whose file names are not zero-padded now shows its pages in the right order, so a saved position in one may land on a different page |
| `view.js` | `external-link` is emitted with the anchor's original `href_` instead of the resolved one; draw options for search matches; an optional TTS highlight | Orbis reads `detail.a.getAttribute('href')` first, so the renamed field does not reach it; the other two are unused |
| `search.js`, `text-walker.js`, `tts.js`, `fb2.js` | An `acceptNode` option, an optional walker filter, TTS fixes for fragments, `isExternal` for FB2 | Additions; Orbis calls none of them directly |
| `vendor/fflate.js`, `vendor/zip.js` | Upstream's rebuilds | zip.js is now 2.8.22 (see the table above) |

## Orbis's patches

Patches 1 to 5 used to be string replacements applied at build time by a plugin in `esbuild.config.mjs`. They are
ordinary edits now, each marked in the source with `// ORBIS patch N`. What follows is the plugin's own explanation,
moved here unchanged. Patches 6 and 7 came with the upstream merge and follow after it; patches 8 to 38 after them.

Five patches to Foliate. The first two fix mobile annotation navigation landing one page short of the target;
the third stops the column gutter taking its size from the side-margin setting; the last two keep one bad
reference in a book's CSS from making the whole chapter unopenable.

### Patch 1

column-width: remove Math.trunc() so the CSS value stays a float
(= size - gap). Without this, each column undershoots its nominal size by
frac(size-gap) pixels, accumulating across K columns.

### Patch 2

`#scrollToRect`: add 0.5px tolerance before Math.floor for the offset→page
mapping. With DPR snapping, rect.left for column K can land up to 0.5px below K×size
(on 2× DPR screens), which causes Math.floor to return K-1 (wrong page, one short).
Adding 0.5 before the floor absorbs that sub-pixel error without overshooting: elements
well within a column (e.g. rl = K×size + 800) still floor correctly because
(K×size + 800 + 0.5) / size is still well below K+1.

### Patch 3

columnize: give the gutter a floor of its own, independent of `gap`.

**One number was doing two unrelated jobs.** Foliate derives a single `gap` from the `gap` attribute — which
Orbis maps to the Text margins slider — and spends it twice: `padding: 0 gap/2` for the white space at the
sides, and `column-gap: gap` for the space between columns. Coherent for one column, and at margins 0 it
produces `column-gap: 0px`: two columns of text with nothing at all between them, which is what the desktop
console reported (`gap: '0px'`, `width: '583.245px'` — exactly half the 1166.49px view). Two columns tended to
get turned off, and this is why: the only way to buy a gutter was to accept side margins nobody wanted, so
the control that looked like it should help was the wrong control.

The gutter is not a matter of taste the way side margins are — below a certain distance the eye jumps columns
mid-line and the page stops working — so it takes a floor here rather than a second slider nobody would find.
40px is roughly two characters at reading size.

**The side padding is NOT independent, and it cannot be made so.** The first version of this patch raised
`column-gap` and narrowed `column-width` to match, and left `padding: 0 gap/2` alone — on the grounds that
the padding is what the reader asked for. Every page after the first then started mid-column: turning a page
shifted the text sideways by part of a column rather than replacing it. The geometry forces it, and the
derivation is short enough to keep:

    used  = (size - 2P - (N-1)G) / N          the width CSS gives each column
    pitch = used + G = (size - 2P + G) / N    one column plus one gutter

Paging works only when a page is a whole number of pitches — i.e. `pitch = size / N` — and that holds exactly
when `2P = G`. Foliate's `padding: 0 gap/2` is not a stylistic choice; it is the term that makes its own
pagination land on column boundaries. Raise the gutter and the padding must rise with it or the page and the
columns drift apart, which is precisely what happened: at `G = 40, P = 0` the pitch came out 603px against a
583px page, and every turn accumulated the 20px difference.

So what this patch buys is a gutter with a floor, at the cost of `gutter / 2` of side padding — 20px at the
minimum. Text margins still controls the white space beyond that, through the `#top` grid's own percentage
tracks, which are a separate mechanism; it simply cannot go below 20 while two columns are showing.

**`column-width` moves with the gutter too.** CSS derives the column COUNT from width and gap together:
widening the gutter without narrowing the columns pushes `floor((avail + G) / (W + G))` under two and
collapses the spread to a single column.

The divisor is recovered rather than passed: `columnWidth + gap` is `size / divisor` by construction, so
`width / (columnWidth + gap)` is the divisor, and a single column is left alone — there is no gutter to
protect, and narrowing the one column would strand dead space at its right edge.

### Patch 4

`loadHref` (epub.js): an empty reference stays empty instead of resolving to the file it is written
in. This is the root cause of a failure that cost an afternoon. `replaceCSS` scans a stylesheet's RAW TEXT for
`url(...)`, comments included, so the words "the url() below" in a comment match, capture an empty href, and
`resolveURL('', base)` hands back the base — the stylesheet itself. `loadItem`'s cycle guard
(`parents.every(p => p !== href)`) then sees the sheet as its own parent and takes the blob branch instead of
the text branch, which is where patch 5 comes in. It needs no tokenizer and cannot corrupt anything: an empty
URL was never going to resolve to a resource.

### Patch 5

the paginator's `data` listener: leave a non-string payload alone. That listener rewrites CSS text
(`-epub-` prefixes, `vw`/`vh`, `page-break-*`) and calls `.replace` on whatever arrives typed `text/css`. When
a sheet comes down the blob branch — patch 4's case, or a genuine circular `@import`, or anything else we have
not thought of — that is a `Promise<Blob>`, and the `TypeError: s.replace is not a function` kills the section:
`goTo` swallows it into `console.error`, so the reader sits on "Loading content…" with nothing in Orbis's own
log. **The book must not become unopenable because one stylesheet is odd.** With the guard the chapter renders,
and because Orbis inlines `blob:` stylesheets anyway (see `book-styles.ts`) the CSS still applies — only
foliate's URL rewriting inside that one sheet is lost, so images it references may not resolve.

Comment stripping was considered and rejected: `/*` is legal inside a CSS string and inside a `url()`, so a
regex stripper corrupts valid sheets, and it would still miss an empty `url()` written outside a comment.

### Patch 6

`loadItem` (epub.js): a script item is refused unless a listener allows it. Before the merge, `EPUB` had
`allowScript = false`, and `loadItem` returned `null` for any script item. Upstream replaced that with a `load` event
whose `detail.allow` a listener may change, and which defaults to `true`, so a book's scripts would now load unless
something objects. Orbis listens for no such event. It strips scripts and applies a content security policy to every
book document it renders (`reader/book-html-guard.ts`, `docs/design/security.md`), so this is not the only thing
stopping them, but it was one of the layers, and a merge should not remove one quietly. The default is now
`allow: !isScript`: every other item loads as before, a script item does not, and the event is still there for
anyone who wants to decide otherwise.

### Patch 7

`loadResource` (mobi.js): the section blob keeps its MIME type. Upstream's KF8 `transformTarget` commit (`f2d3215`)
wrote `new Blob([newData], { newType })`, a property named `newType` rather than `type`, so every KF8 section blob
lost its type. Orbis's own reading path does not notice: `foliate-patches.ts` reads each section's text and always
parses it as HTML. It is still a regression from what the line did before, and anything else that reads the blob
would see an untyped document. `{ type: newType }` is what upstream meant.

### Patch 8

the paginator's `ResizeObserver` (paginator.js): a paginator whose size is zero does not re-render. Hiding a book —
Obsidian hides an inactive tab with `display: none` — shrinks the paginator to 0×0, and the observer re-laid the
chapter out at that size. A chapter holding a table with borders (`<table border="1">`, two cells are enough) then
hung the browser engine itself: a bordered cell needs its borders' width, a column 0px tall can never hold it, and the
engine laid out column after column without end. Obsidian froze on switching away from the book, with no script
running for the debugger to pause in. It was reproduced in headless Chrome with this folder and no Orbis code at all,
and a book without the border, or the patch, ends it.

Laying out a page nobody can see does nothing useful, and showing the book again sizes the paginator, which fires
the observer with a real size: it renders then, at the same size and page count as before it was hidden. A side
effect is that the hidden render no longer throws the `getComputedStyle` TypeError from `#replaceBackground` — but a
visible render can, which is patch 9.

### Patch 9

**Gone with patch 22**, which removed the code it guarded: `#replaceBackground` no longer reads anything from the
chapter. Kept here for the record.

`#replaceBackground` (paginator.js): a document with no root element is not asked for its theme color.
`getComputedStyle(doc.documentElement)` throws `parameter 1 is not of type 'Element'` when the chapter's frame has no
root element, and the paginator's `ResizeObserver` can render at that moment with the book visible: the error was
seen on the desktop, uncaught, from `ResizeObserver → render → #replaceBackground`, after patch 8. With no root there
is no `--theme-bg-color` to read, so the background is drawn as the book wrote it — the same as a book that sets no
theme color — and the next render, with the document in place, reads it. Not covered by a test: nothing reaches the
paginator outside a real browser, and the moment the frame has no root element has not been reproduced on demand.

### Patch 10

`withIndexCache` (epubcfi.js): many CFIs in one document index each parent's children once. `nodeToParts` rebuilds
the indexed child list of every ancestor for every CFI and searches it linearly, so a CFI costs time in proportion to
its parents' sizes. The location index makes one per location of a section, all in one parsed document that does not
change meanwhile: on a 3.9 MB section with 73,000 text nodes and 2,500 locations that was 12 seconds of main thread
(measured in Chrome), and about half of a minute-long freeze on a large book's first open in Obsidian. Inside `withIndexCache(fn)` each
list is built once and carries a node-to-index map (`orbisIndexOf`); outside it nothing is cached, so no other caller
can see a list from a document that has since changed. Only unfiltered lists are cached. `fn` must be synchronous.
Covered by `epubcfi-index-cache.test.ts`, which checks the CFIs are the same strings with and without the cache.

### Patch 11

`makeBook` (view.js): every failure to open says what kind it is. The error classes set `name` — `NotFoundError` (an
empty file), `UnsupportedTypeError` (recognised as no book format) — because a class name is not something a minified
build keeps; and a new `DamagedBookError` wraps any failure once the format is known: a cut-off zip, a zip with no
EPUB container, broken XML, an unreadable MOBI or FB2. Orbis tells a reader which of these it was, in its own words
(`book-open-error.ts`), rather than passing on *File type not supported* for a text file named `.epub` or *End of
central directory not found* for a download that stopped part-way. Covered by `book-open-error.test.ts`, which opens
an empty file, a text file and a cut-off EPUB through `makeBook`.

### Patch 12

`View` and `#redisplay` (paginator.js): a chapter frame the browser reloads is shown again. A browser reloads an
iframe that is moved in the page, and Obsidian moves a pane's elements when it is split (**Split down** on the only
pane wraps it in a new split) or dragged to another split. The reload brings back a fresh copy of the chapter with
none of `View.load`'s setup — no columns, no styles, the body background — and nothing listened for it: the reader
went blank, its position NaN, until a page turn. `View.load` now hands any later `load` to `onReload`, and the
paginator shows the section again through `#goTo` as if turning to it, so every listener runs again — Orbis's
`load` and the marks overlay among them. The place it was showing is carried over as a CFI taken from the old Range,
whose nodes outlive their document, and resolved in the fresh copy; if that fails, the section's start. Measured
before it was written: the debug log showed the frame loading a fresh document at Split down, and still logs it (`frame reloaded by the browser`). The
carrying is covered by `reloaded-frame-anchor.test.ts`; the redisplay needs a real browser.

### Patch 13

`Paginator.render` (paginator.js): no layout at zero size, whichever way the render was asked for. Patch 8 guarded the
`ResizeObserver`; an attribute change calls `render()` directly, and so does a change of flow. Leaving focus mode on
a phone removes the `margin` attribute at a moment the paginator's container is 0px tall, part-way between focus
mode's layout and the normal one, and the render that followed laid a chapter with bordered table cells into
columns 0px tall: patch 8's hang, on Android, by the other door. The debug log on the phone showed it, the render
starting with `height: 0` and never reaching the measurement after `columnize`; on entry the same steps ran at
739px in 18 ms. The skipped render is not lost: the container's next real size fires the observer, which renders at
that size with the new margin. Not covered by a test, for patch 8's reason: it needs a real browser.

### Patch 14

`Paginator.setImageSize` (paginator.js): a block that holds only images, and no text, gets `text-indent: 0`.
`setImageSize` caps an image at 100% of its block's width, but `text-indent` is inherited, so a figure inside an
indented paragraph sits on a line that starts 1.5em in: the image is as wide as the column and starts part-way across
it, and the overflow is drawn on the next page. The indent is in ems, so a larger font pushes it further. Measured in
headless Chrome in a 287px column with the paragraph's `text-indent: 1.5em`: the image overflowed by 24px at 100%
and 72px at 300%, and by nothing at any size once its block's indent was zero. Only blocks with no text are touched:
a paragraph that opens with a small inline image, such as a drop cap, keeps its indent. Not covered by a test, for
patch 8's reason: it needs a real browser.

### Patch 15

`splitRangeForRects` (overlayer.js), which replaces upstream's `#splitRangeByParagraph`: a range is measured one
text node at a time. Upstream measured each `<p>` under the range's common ancestor, and the whole range only when
there was no `<p>` at all, so a passage selection across several blocks was drawn on its paragraphs and not on a
heading, a list item without a `<p>`, a table cell or `<pre>` text in between. Hit-testing used the same rects, so
selecting those parts of the mark found nothing. Splitting at all is still needed: a range that wholly contains a
block returns that block's box among its client rects, margins included. A range inside one text node contains no
element, so it returns only lines of text. An image, an SVG, a video or a canvas that the range wholly contains is
measured by its own box, as it was inside a `<p>`. `reader/mark-draw.ts` merges the rects per line, so a mark looks
the same as before where it was drawn before. `overlayer-split.test.ts` runs a paragraph, a heading, a tight list and
two paragraphs through the split, and fails without the patch; `tts-units.test.ts` uses the same function.

### Patch 16

`SectionProgress.getProgress` (progress.js) also returns `startFraction`, the book fraction at the top of the page.
Upstream's `fraction` adds the page's own share (`nextSize`), so it is the END of the page: on a chapter's first page,
in a window wide enough to hold a quarter of the chapter, it reads a quarter of the way in. Orbis reads every
location at the top of the page, so the book and chapter percentages take `startFraction`, and a chapter's first page
reads 0%. `fraction` is unchanged, for foliate's own uses. `foliate-progress.test.ts` checks both on a section's
first page, and fails without the patch.

### Patch 17

`FixedLayout`'s frame (fixed-layout.js) gets `part="filter"` before its `sandbox`, the order paginator.js already
uses. `src/foliate-patches.ts` strips `allow-scripts` from a book frame on desktop, and knows one by its `part` at the
moment `sandbox` is set; set afterwards, the frame of every fixed-layout book — comics, picture books — kept
`allow-same-origin allow-scripts`, the pair that amounts to no sandbox. The book's own `script-src 'none'` still held.
`foliate-sandbox-order.test.ts` checks both frame builders set `part` first, and fails without the patch.

### Patch 18

`View.render` (paginator.js) returns while the frame's document has no root element. Upstream returned only when there
was no document at all, but while a frame swaps in a chapter its document exists with `documentElement` null, and a
resize at that instant reached `columnize`, which threw on the missing root (`Cannot destructure property 'style'`). The
next real layout renders as usual. Not covered by a test, for patch 8's reason: it needs a real browser.

### Patch 19

`#turnPage` (paginator.js): a page turn that crosses into the next or previous file lands as a page turn. Upstream's
`#display` scrolled every new file into place through `scrollToAnchor`, which reports `navigation`, and view.js
updates its history entry only for `page`, `snap` and `scroll`. So the page a turn arrived on by crossing a file was
never recorded: from the cover, Next page into the first chapter, a footnote's **Go** and then **←** returned to the
cover. Now `#turnPage` passes `page` through `#goTo` to `#display`, which lands the new file with it; a jump —
a link, the contents, search — still reports `navigation`, so the entries those push are unchanged. Like any page
turn, the file-crossing one now sets the anchor to the visible page and places no caret. Not covered by a test, for
patch 8's reason: it needs a real browser.

### Patch 20

`FB2Converter.getImageSrc` (fb2.js) answers only from the book's own `<binary>` elements: an href that is not a `#id`
of one becomes `data:,`, as a missing href already did. Upstream returned it as it stood, so a picture could be any
URL — loaded with the chapter, and fetched by `getCover` when the book opened, from Obsidian's own window, where no
book CSP applies: a book could send a request anywhere, a LAN address included. `getCover` returns null for `data:,`
rather than fetching an empty picture. `fb2-remote-images.test.ts` checks the cover, a picture in the text, and that a
cover kept in the book still reads; it fails without the patch.

### Patch 21

`customElements.define` in view.js, paginator.js and fixed-layout.js runs only when the element is not already
defined. A reload of the plugin — an update, or turning it off and on — reads these files again, and a browser
neither defines an element twice nor lets one be unregistered: upstream's bare `define` would throw, and the plugin
would fail to load. Orbis used to cover this by wrapping `customElements.define` for the whole window, which reached
every other plugin's elements and was never taken off. So the elements keep the classes the first load registered
until Obsidian restarts; `reportStaleRenderer` in `src/foliate-patches.ts` notices that and says so.
`foliate-patches.test.ts` checks that every `define` in this folder is guarded.

### Patch 22

Nothing of a book's background is painted outside its chapter. Upstream's `getBackground` read the chapter's computed
`background` — image included — and `#replaceBackground` (paginator.js) copied it onto one element per column in the
paginator's shadow root, which is in **Obsidian's** window: a `url()` there was fetched where no book policy applies.
Measured on the desktop with a logging server: a book that beats the reader theme's `html, body { background: …
!important }` — a more specific selector, or an `!important` in a `style` attribute — made Obsidian request its
picture on opening, a read receipt with no click. `View.load` no longer reads the
background or sets `doc.body.style.background = 'none'`, which also replaced Orbis's inline page color, and
`#replaceBackground` only empties the layer; its calls stay, so the shape of the file stays upstream's.

The page color is the reader's: `paintPageColor` (`src/reader-themes.ts`) sets the theme's color as an inline
`!important` on the chapter's `<html>` and `<body>`, and `applyHostBg` paints it behind the frame, where the copied
layer used to. Ordinary books look the same: screenshots before and after, one and two columns, scrolled, dimmed, and
a comic, match. `foliate-patches.test.ts` checks that no file here sets or copies a background; it fails without the
patch.

### Patch 23

A tap on any link in a chapter reaches foliate's link handler, not only one on `<a href>`. `#handleLinks` (view.js)
looked for `closest('a[href]')`; a chapter can also hold an image map's `<area href>`, an SVG `<a>` written with
`xlink:href`, and a MathML element with `href`, and a tap on any of those went to its address in the chapter's frame —
no `external-link` event, so no "Open this link?". Measured with `fixtures/link-checks.epub` :
on every device the chapter flickered or was left blank; on Android an `<area>` to `obsidian://search`
ran the search; iPhone and iPad followed a formula's `href`. `findLink`, exported from view.js, walks up from the
tapped element to the nearest `<a>` or `<area>` with `href` or `xlink:href`, or MathML element with `href`, and
returns it with its address as written; the handler then does what it did for `<a href>`. A picture that is not a
link — an SVG `<image xlink:href>` — is not one. `foliate-links.test.ts` checks each shape and fails with the old
lookup.

### Patch 24

Three loops in mobi.js that never ended on a damaged or crafted MOBI/AZW3, each reached
when a book opens — and so also from the library's scan and cover extraction:
- **The TAGX tag table** is read only as far as its record goes. A length past the record's end gave tags with no
  mask, and `countUnsetEnd(undefined)` shifts zero for ever; `countUnsetEnd` now also returns at once for 0. Measured:
  either AZW3 fixture with its TAGX length raised never finished opening; with the patch it opens with the same 31
  and 42 sections as the original.
- **An entry's values** stop at the record's end: past it `getVarLen` reads nothing and returns a length of 0, and
  `while (count < valueBytes)` never advanced.
- **A HUFF code of no bits** is refused with `Invalid HUFF code length`: the decompress loop would read the same bits
  for ever, appending to its output until memory ran out.

Ordinary MOBI and AZW3 books read identically before and after. `getIndexData` and `huffcdic` are
exported for `mobi-loops.test.ts`, which feeds them crafted records in a worker stopped after 3 s, so a loop that came
back fails the test instead of hanging the run; each case fails without the patch.

### Patch 25

`replaceCSS` (epub.js) finds `url(…)` with `cssURLMatches`, one pass, instead of
`/url\(\s*["']?([^'"\n]*?)\s*["']?\s*\)/gi`, whose three whitespace runs can split the same spaces in every way. A
`url(` followed by a few hundred spaces and no `)` — in a comment is enough — took seconds on every load of the
chapter: 600 spaces, 6 s in V8 and 2 s in JavaScriptCore; 1 KB, minutes. The scanner
returns exactly the old pattern's matches, because that match always ends at the first `)` after the opening quote;
`CSS_URL` stands in for the regex in `replaceSeries`, which is unchanged. Checked against the old pattern on the
stylesheets, `<style>` blocks and `style` attributes of many ordinary books and on 1.5 million random strings: no
difference. A megabyte of the worst input takes 13 ms in V8. `foliate-css-patterns.test.ts` keeps the old pattern
as its reference.

### Patch 26

The paginator rewrites `vw` and `vh` with `VIEWPORT_WIDTH` and `VIEWPORT_HEIGHT` (paginator.js),
`/(?<!\d)(\d+(?:\.\d+)?|\.\d+)vw/gi` and its `vh` twin, instead of `/(\d*\.?\d+)vw/gi`, which can split a run of
digits between `\d*` and `\d+` in every way from every start: 4,000 digits in a stylesheet comment took 9 s in V8 and
in JavaScriptCore. They match the same numbers at the same places: `\d*\.?\d+` and the
new alternation describe the same numbers, and a match preceded by a digit could always have started one earlier, so
the leftmost one never is. Same checks as patch 25, no difference; a megabyte of digits takes 3 ms in V8. Patch 31
does the same without the lookbehind.

### Patch 27

A tap inside SVG that `findLink` finds no link for has its default action cancelled: `#handleLinks` (view.js) calls
`preventDefault()` when `insideSvg`, exported from view.js, finds an SVG element at or above the tapped one. Two SVG
links get past `findLink`, and a tap on either went to its address in the chapter's frame, with no "Open this link?":
- **A `<use>` copy of a link.** The `<a>` sits in `<defs>` and a `<use>` draws a copy. The tap lands on the `<use>`,
  which has no `<a>` above it, and the copy's own elements are in a shadow tree the page cannot reach.
- **An address an animation supplies** (`<set attributeName="href" to="…">`): there is no `href` to read.

Measured with `fixtures/frame-navigation.epub`: on iPhone and iPad a script in the book's own document ran in
Obsidian's window; on Android `obsidian://search` ran with no dialog; on the Mac the reader was left blank. In SVG the
only default a tap has is following a link, so nothing a book can do without script stops working. The test is any
SVG ancestor, not only the tapped element, because HTML inside a `<foreignObject>` in an animated link is HTML; and no
`<label>` or `<summary>` above it is an exception, since a hidden link inside one still wins the tap.

Where the engine has the Navigation API, the chapter also refuses every navigation it starts
(`keepChapterInPlace` in `src/reader/chapter-navigation.ts`), which covers these and any route not yet found. This
patch is what is left on an engine without it (iPadOS before 26.2). `frame-navigation.test.ts` checks it, and fails
without the patch.

### Patch 28

Three patterns in epub.js that a crafted EPUB could make take seconds, each on every open or every chapter load,
rewritten to read their text in one pass:
- **The OPF's `prefix` attribute** (`getPrefixes`) is split into `prefix: url` pairs at whitespace, as the EPUB spec
  writes it, instead of `/(.+): +(.+)[ \t\r\n]*/g`, which tried every split at every start (64 KB: two seconds at
  open).
- **A processing instruction's `href`** is found with `/\b(href\s*=\s*['"])([^'"]*)(['"])/i`, without the leading
  `(?:^|\s*)` that rescanned each run of whitespace (64 KB: two seconds a chapter). The old pattern also dropped the
  space before `href` from the instruction.
- **A `srcset`** has its addresses replaced by `replaceSrcset`, which reads it as the HTML spec does — separators, an
  address up to whitespace less any commas ending it, then descriptors up to the next comma — instead of
  `/(\s*)(.+?)\s*((?:\s[\d.]+[wx])+\s*(?:,|$)|,\s+|$)/g`, whose lazy address retried at every start (a long run of
  spaces: 64 KB, four seconds a chapter). The commas ending an address are counted back from its end: `/,+$/`, which
  first found them, tried again from every comma of a run inside the address (64 KB of commas: two seconds).

`crafted-book-freeze.test.ts` checks `replaceSrcset` on ordinary srcsets and on both crafted ones.

### Patch 29

More loops in mobi.js that a damaged or crafted MOBI/AZW3 could run for minutes, in the class patch 24 began, each
reached when a book opens and so also from the library's scan and a catalog download:
- **An EXTH record shorter than its own header** (length under 8) never moved the offset on, and the count is a
  uint32: a 386-byte file read the same record millions of times. `getEXTH` stops there, and at the end of the header.
- **An index entry's fixed-count values** stop at the record's end, as patch 24 made the variable-length ones do: the
  count is the book's, up to 255 × 255 per tag per entry.
- **An index record's entry count** is held to the offsets the record has room for.
- **An index record's values are read once between its entries.** Each entry's values lie in its own part of the
  record, but nothing held a book's offsets to that: sixteen thousand entries pointing at one place each read the
  record from there to its end. The reads an index record makes, all its entries together, stop at its length, as
  they stop at its end. Every MOBI and AZW3 file available gave the same index tables before and after.
- **A tag table** holds no more than 512 entries: a tag is one byte, so 256 tags and an end mark for each control
  byte. Every entry walks the whole table, so a longer one cost entries × its length.
- **NCX children** are found from a map of entries by parent, built once, not by filtering every entry for each one
  (40,000 entries: seconds); an entry that is its own ancestor is visited once.
- **HUFF/CDIC output** is gathered and joined once instead of copied whole for every code (one 4 KB record: half a
  minute), and a record that decompresses past 1 MB is refused.
- **The FDST table** holds no more entries than its record has room for, instead of allocating the count the header
  claims.

`getEXTH` is exported beside `getIndexData` and `huffcdic` for `mobi-loops.test.ts`; its EXTH, fixed-count,
crowded-index and tag-table cases each fail without the patch.

### Patch 30

`book.resolveHref` and `book.getTOCFragment` (fb2.js) escape the fragment with `CSS.escape` before putting it in an
attribute selector. The fragment is the book's, and a quote in it made `querySelector` throw, so that link or contents
entry went nowhere.

### Patches 31 to 36: the Community directory's review

The Obsidian Community directory scans every file in the repository with Obsidian's lint rules, and its review of
0.1.0 reported 21 errors, all in this folder. `pnpm lint:obsidian` now runs those rules here too (see
`scripts/check-obsidian.ts`), and fails on any of their errors. An `obsidianmd/*` rule cannot be turned off with a
directive comment, so each change below is to the code.

### Patch 31

**No regex lookbehind**, which iOS and iPadOS before 16.4 cannot parse: a lookbehind anywhere in `main.js` is a syntax
error there, and the plugin does not load at all. Two were in paginator.js, both in the stylesheet rewrite:
- **`-epub-` prefixes** were removed with `/(?<=[{\s;])-epub-/gi`. Now `/([{\s;])-epub-/gi` matches the character
  before the prefix too and puts it back (`'$1'`). The character before one match cannot be part of another, since a
  match ends in `-`, so the same prefixes go.
- **`VIEWPORT_WIDTH` and `VIEWPORT_HEIGHT`** (patch 26) began with `(?<!\d)`, so that a search never started inside a
  run of digits. Each is now `/(\d+(?:\.\d+)?|\.\d+)vw|\d+/gi` (and `vh`) behind an object with `Symbol.replace`, so
  `css.replace(VIEWPORT_WIDTH, fn)` still works. A run of digits that no match starts is taken whole by the last
  branch and given back unchanged, so the search moves past it, as the lookbehind made it. `fn` sees only the real
  matches, with the same arguments. `foliate-css-patterns.test.ts` checks it against upstream's pattern as before,
  with cases of matches next to each other added. A megabyte of the worst inputs takes from 8 to 300 ms in V8.

### Patch 32

**`unescapeHTML` (mobi.js) decodes character references without `innerHTML`.** It reads the title, author, publisher,
description, subjects and rights, and every contents label. Upstream set the text as a `<textarea>`'s HTML and read its
value back. It is now parsed by a `DOMParser` as the text of a document's body, each `<` written as `&lt;`. Neither way
can make an element. They give the same text:
- in a textarea's text and in a body's, `&` is the only other character that means anything, and it is decoded the
  same way in both;
- NUL becomes U+FFFD in a textarea but is dropped from a body's text, so it is replaced with U+FFFD first;
- both turn CR and CR LF into a line feed.

Text with no `&`, CR or NUL comes back as it is, without parsing. `mobi-unescape.test.ts` keeps upstream's textarea as
the reference and compares the two on crafted cases and 5,000 random strings.

### Patch 33

**`Overlayer`'s zoom check uses `Platform.isIosApp`** (overlayer.js), not the user agent. WebKit does not zoom a
range's client rects, so the overlay reads the zoom itself there. Upstream found WebKit from the user agent; in
Obsidian the one WebKit app is the iPhone and iPad app, and every other is Chromium, so `Platform.isIosApp` picks out
the same devices. overlayer.js imports `Platform` from `obsidian` for this, the only file here that does.

### Patch 34

**Fixed inline styles moved to the paginator's stylesheet, or cleared.** Each change gives the same computed style:
- **The chapter frame is shown and hidden with its `hidden` attribute** (paginator.js `View`), not
  `display: block` and `none`. Nothing else sets the frame's display, and as an item of the view's flex box it is a
  block either way.
- **`expand()` clears the values it set to a fixed one** (with `removeProperty`, patch 36): the view's padding and the overlay's margin (no padding or
  margin), the frame's and view's size across (100%, now from the stylesheet), and the overlay's top and left (0,
  now from the stylesheet). `#top`'s padding in scrolled flow is cleared the same way: the stylesheet gives it none.
- **A highlight's opacity and blend mode** (`Overlayer.highlight`) come from the class `foliate-highlight`, in the
  paginator's stylesheet, with the same two custom properties. The paginator is the only renderer with an overlay.
- **The hidden page of a portrait spread** (fixed-layout.js) is set to `display: none` in the same assignment that
  shows the others, as the frame's display already was.

The epub.js directive that allows control characters in the font deobfuscation key's pattern now says why, as the
directive rules require.

### Patch 35

**`CursorAutohider` is removed** (view.js). It hid the pointer after a second without moving, only when the view has
the `autohide-cursor` attribute, which Orbis never sets, and it listened to every mouse move over the reader and each
chapter to do so.

### Patch 36

**The values patch 34 clears are removed with `style.removeProperty()`**, not by assigning `''`, which does the same.
The review of 0.1.1 reported the nine `= ''` lines in `expand()` and the scrolled flow: the directory runs
`no-static-styles-assignment` as it was up to eslint-plugin-obsidianmd 0.4, which takes any literal for a fixed value,
`''` included. In the column layout, the overlay's `left` and `top` are each either removed or set to the page size,
by an `if` on the writing mode rather than a `?:` with `''` on one side. `pnpm lint:obsidian` now checks the shipping
and vendored code for a literal assigned to a style, as the directory reads the rule.

### Patch 37

**A swipe turns the page in the fixed-layout renderer** (fixed-layout.js), which CBZ comics and fixed-layout EPUBs
use. Upstream gave it no touch handling at all, so on a phone or tablet only the page buttons turned its pages. A touch
on a page goes to that page's own document, so each frame gets the listeners as it loads, and the element gets them
too, for the margins around the pages.

A one-finger swipe that moves further across than up or down turns the page when it covers 40px, or 10px at a flick
(0.3 px/ms). The finger moving left brings in what is to the right: the next page in a left-to-right book, the
previous one in a right-to-left book. As in the paginator, `touchmove` is cancelled so the browser neither scrolls nor
bounces, and nothing turns while text is selected or the screen is pinch-zoomed. A page zoomed past the pane (the
`zoom` attribute, which Orbis does not set) pans as before, and turns only from the edge it was already at when the
swipe began.

A swipe that turns the page swallows a click that follows it within half a second. A flick of a few pixels can still
end in a click, which would open the picture in Orbis's image viewer, or turn the page again at its edge.
`fxl-swipe.test.ts` checks each of these.

### Patch 38

**`max-column-count` decides one page or two in the fixed-layout renderer** (fixed-layout.js). Upstream showed a
two-page spread whenever the pane was wider than tall, and the attribute, which Orbis sets from **Two-column layout**
for every book, was read only by the paginator. At `1` the renderer now always shows one page at a time, in the mode
it already had for a pane taller than wide: one page of the spread shows, and a page turn goes to the other page
before the next spread. At `2`, or with no attribute, it is as before, the book's own `rendition:spread` included.
The attribute is observed, so changing the setting changes an open book at once. `fxl-one-page.test.ts` checks it.

## Patched at runtime, not here

Three other files change foliate's behavior while the app runs. They stay where they are, because they are about
Obsidian rather than foliate:

- `src/reader/ReaderDom.ts` wraps the paginator's `next`, `prev`, `snap` and the `containerPosition` accessor (page
  turns while text is selected, snap-back, and the lock that follows a pinch). These could become edits here one day.
- `src/foliate-patches.ts` patches the browser, not foliate: the iframe sandbox (everywhere but iPhone and iPad), and
  `srcdoc` loading, which is also where every chapter is hardened and kept in its frame (see
  `docs/design/security.md`). Both come off when the plugin unloads (`removeFoliatePatches`).
- `src/reader/book-copies.ts` listens to foliate's `data` event and makes every copy of a book's file inert.

## Taking changes from upstream

This folder is merged through `78914ae`. To take later changes:

1. For each kept file, merge three ways: the base is upstream at the "merged through" commit, "ours" is this folder,
   "theirs" is upstream at the commit you want (`git merge-file ours base theirs`).
2. Keep every row marked **Relies on it** above and every `// ORBIS patch` edit.
3. **Read what each commit changes, not just whether it merged.** The last merge merged all but one file without
   overlap, and still reversed the script default (patch 6) and brought in an untyped blob (patch 7). Check new
   defaults, renamed event fields, and anything that changes how a CFI is computed, since saved positions depend
   on it.
4. Update "merged through" at the top of this file, and add rows for anything new.
5. Test with a Calibre book, a MOBI/AZW3, an FB2 and a CBZ, not just an EPUB from Gutenberg: the patches above were
   each found on one of those.
