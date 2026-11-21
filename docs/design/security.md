# Security model

← [Design Docs](README.md)

What Orbis trusts, what it does not, and where each boundary is enforced.

A threat model is the page you check a claim against before writing it down. A reassurance elsewhere — in
[Dependency Security](dependency-security.md), in the [settings guide](../guide/settings-reference.md) — holds only
as far as a control named here enforces it.

---

## What Orbis trusts

- **The reader.** Anything they type, choose, or point the plugin at. A reader who sets an export folder to a
  strange place, or a speech server to a hosted one, has made a decision Orbis carries out.
- **The vault.** Files in it are the reader's own, Orbis's data files included: `.orbis` and `.marks` files,
  recordings, sync files, settings. Orbis reads and writes them without asking whether they are hostile to itself.
  Whoever can write to the vault — another of the reader's devices, a collaborator in a shared vault — is trusted as
  the reader is; see [What Orbis deliberately does not defend](#what-orbis-deliberately-does-not-defend).
- **Obsidian.** Its APIs, its sanitizer, its keychain, its own network client.

## What Orbis does not trust

Four inputs, each written by somebody else:

| Input | Written by | Reaches Orbis through |
|---|---|---|
| **A book** — its markup, its metadata | Whoever made the file | Opening it: rendering, annotations, generated notes, filenames |
| **A catalog feed** | Whoever runs the OPDS server | Book sources: browse targets, acquisition links, credentials |
| **A downloaded asset** | A CDN, or whoever compromised one | Piper's WASM engine, voice models, dictionaries |
| **A dependency** | Its author, or its npm publisher | The build |

Everything below is about those four.

---

## A book

**A book is a file somebody sent you**, and EPUB, MOBI and FB2 all carry HTML. This is the largest surface, because
a book reaches the renderer, the annotation system, the note generator and the filesystem.

### Script in book content

foliate-js's own README says not to render a book without a CSP. Orbis's `srcdoc` patch makes the case sharper
rather than softer: chapters are loaded as `srcdoc` so the document is **same-origin with the host page** (a blob:
iframe gets an opaque origin on WKWebView and our listeners never fire), which means a script in a book could reach
`parent` — the Obsidian window, with the vault API on it.

**Enforced in `reader/book-html-guard.ts`**, on every chapter, on every platform, in the one place they all pass
through. Two layers, because they fail differently:

- a CSP meta first in the head — `default-src 'none'`, with `script-src`, `object-src`, `frame-src`, `child-src`,
  `base-uri` and `form-action` named as `'none'`, and only `blob:` and `data:` allowed for images, media and fonts,
  plus inline styles
- removal of `<script>` elements, `on*` attributes, `javascript:` URLs, frames (`iframe`, `frame`, `embed`; an
  `<object>` gives way to its fallback content), `<meta http-equiv="refresh">`, and prefetch and preconnect links

A meta policy governs only what is parsed after it, so a malformed document can outrun it; stripping cannot
anticipate every spelling of a handler. Neither alone is enough.

**The one place they all pass through fails closed.** foliate loads every chapter by assigning its frame's `src`, and
`installFoliateSrcdocPatch` wraps that setter to send the chapter through the guard. If the setter cannot be wrapped,
no book opens: the reader says it cannot put its protection in place (`UnprotectedReaderError`) rather than loading
chapters as they came. No engine Orbis runs on refuses, since the web's IDL rules make the setter one that can be
wrapped. And a chapter whose file cannot be read — its `blob:` URL revoked or never made, the only failure measured —
gets an empty document, never its own unhardened one.

**A frame inside a chapter is a document this guard never sees.** foliate turns `<iframe src="x.xhtml">` into a
`blob:` document, and a `blob:` document takes its policy from the window that made it — Obsidian's, not the
chapter's. On iPhone and iPad its script ran and reached the chapter. Hence both layers name frames: the policy
refuses to load one, and the stripping removes the element.

**The chapter is parsed once more after the stripping, and the two parses need not agree.** The guard parses the
chapter, hardens it and serializes it into `srcdoc`, where the frame parses it again. The serializer writes the text
of a `<style>`, `<xmp>`, `<noembed>`, `<noframes>` or `<plaintext>` as it stands, so a book's stylesheet holding
`</style>` ends its element in the frame, and an element that the frame finds inside MathML (an `<mglyph>` the first
parse moved out in front of a `<table>`) has its text read as markup. `<noscript>` differs the other way: the guard
parses with scripting off, and the frames on iPhone, iPad and Android allow scripts, so its contents are elements to
one and raw text to the other. Either way the frame gets markup the stripping never saw, such as a refresh, which no
CSP directive governs. So the guard's last step leaves nothing whose text could become markup: every `<` in a
`<style>` is written as the CSS escape `\3c `, which CSS reads as the same character, and a `<style>` holding a
comment or an element is left with its text alone; HTML `<xmp>` and `<plaintext>` become `<pre>`; `<noembed>` and
`<noframes>` go; `<noscript>` gives way to its contents; and `<template>`, whose contents the guard's queries never
reach, is removed.

**Then the result is checked against the document the frame will build.** Those are the disagreements known, and no
such list can be shown complete, so the guard does not rely on it. It parses its own output the way the frame will,
hardens that, and repeats until the hardening changes nothing in it, at most three times: the frame then builds a
document the guard has already looked at and left alone, whatever the trick was. "Changes nothing" is watched with a
`MutationObserver`, not judged by comparing text, because reading a document back is not exact even when nothing is
wrong — the parser drops the newline that opens a `<pre>`. For the parse to be the frame's, two things are pinned:
every chapter is written with `<!DOCTYPE html>`, since without one `DOMParser` nests some markup the quirks way; and
`<noscript>`, the only element that parses differently with scripting on, as the mobile frames have it, is never left.
A chapter that never settles, that cannot be parsed, or whose hardening throws is shown as its text, in paragraphs
under a note saying why, built so that nothing in it can become markup; nothing may stop a chapter appearing. The
check costs no more than the hardening, and an ordinary chapter settles at once. The hostile
fixture has a check for each known disagreement that an EPUB can carry, in a chapter of their own that stays
well-formed XHTML; a malformed chapter that must appear, as itself; and a chapter with no doctype.

### A chapter stays in its frame

**The guard hardens the chapter Orbis writes into the frame. It never sees a document the frame is sent to.** A
chapter can send its own frame elsewhere with a link the reader's link handler cannot read (`findLink`, below): a
`<use>` copy of an SVG link, whose tap lands on the `<use>`, or an address an SVG animation supplies, which no
attribute holds. Measured with `fixtures/frame-navigation.epub`: on the Mac the reader was left blank; on Android an
`obsidian://` search ran with no dialog; and on iPhone and iPad the frame loaded a document of the book's own, outside
the guard, whose script drew a banner in Obsidian's window with the vault in reach.

**Enforced in `reader/chapter-navigation.ts`, for every route at once.** Each chapter cancels every navigation it
starts — a tap, a key, a form, a trick not yet found — through the Navigation API's `navigate` event
(`keepChapterInPlace`, which the srcdoc patch attaches to every document the frame loads). Orbis's own loads write a
new document into `srcdoc` rather than navigate the old one, and fired no `navigate` event on the Mac, the iPad or
Android; `about:srcdoc` is let through regardless. Measured on all three: the API is there, and every row of the
fixture was cancelled. Safari has it from 26.2; on an engine without it, the debug log says so once.

**Two narrower layers sit under it.** A tap inside SVG that `findLink` cannot read does nothing (ORBIS patch 27): in
SVG the only default a tap has is following a link. And the stripping removes an animation that writes a link's
address or a handler, so a chapter's links all have an address the link handler can read.

### Copies of a book's files

**foliate gives each file a chapter uses — a picture, a font, another chapter — a `blob:` address**, made in
Obsidian's window and so of Obsidian's origin. A chapter is meant to reach those files only as what they are, but a
frame sent to one shows it as a page of its own, under Obsidian's policy on iPhone and iPad (the frame inside a
chapter above). That is how the script in `frame-navigation.epub` ran.

**Enforced in `reader/book-copies.ts`: a copy keeps its type only when nothing of that type can run** — pictures,
sound, video, fonts and stylesheets. An SVG file keeps its type, which a picture needs, and loses its scripts,
handlers, animated addresses and processing instructions (`hardenSvgText`, parsed and written as XML, which reads back
exactly as written). Everything else — HTML, XHTML, every XML type, since an XML document runs an XHTML `<script>` and
can name an XSLT sheet, and anything unknown — is served as plain text. Nothing reads those as pages: the reader takes
a chapter's text from its copy and hardens that, and a frame inside a chapter is removed. This layer does not depend
on catching a navigation, so a route past the two above still finds nothing to run.

It is done once for every copy, through the `data` event each EPUB and KF8 file passes on its way to a `blob:`
address. MOBI and FB2 make copies too, of their pictures and of their chapters, but nothing in a book can name those
addresses, so no link reaches them.

### A book reaching the network

A book carries everything it shows; foliate rewrites each resource inside it to a `blob:` URL (`data:` for FB2
pictures). So the policy allows those and nothing else, and a remote image, stylesheet or font in a book — a request
to whoever made it, sent when the reader turns to the page — is never fetched. A refresh, which would send the
chapter's frame to a web page, and a connection hint, which reaches the network without a fetch a CSP could see, are
removed. An ordinary book loads nothing from outside itself and holds no frame, so none of this costs it anything.

The policy governs the chapter's frame and nothing outside it, so nothing of a book's may reach Obsidian's own
window, where no book CSP applies. Three paths did, each closed outside the policy:
- **A picture in the image viewer.** Selecting a picture opens it over the reader, in Obsidian's window, and its Copy
  button decodes it there. A remote picture the chapter would not load was loaded that way. The viewer and the copy
  take only the book's own pictures, at `blob:` and `data:` addresses (`isBookImage`, `src/reader/image-copy.ts`);
  selecting any other picture does nothing.
- **An FB2 picture.** Foliate fetched an FB2 cover named by an outside URL. ORBIS patch 20 reads FB2 pictures only
  from the book's own `<binary>` elements.
- **A chapter's background.** Foliate copied the chapter's computed background onto the reader's own page, so a
  `url()` in it was fetched from Obsidian's window when the book opened: a book that beat the theme's
  `!important` with a more specific rule, or one in a `style` attribute, sent a request that way. ORBIS patch 22
  copies nothing, and **`paintPageColor` in `src/reader-themes.ts`** sets the theme's color as an inline
  `!important` on the chapter's `<html>` and `<body>`, which nothing in a book can beat: the page color is the
  reader's, and a book's background picture is not shown. Backgrounds inside the chapter are the book's content and
  keep theirs.

The desktop and Android are additionally covered by `foliate-patches.ts` stripping `allow-scripts` from the iframe
sandbox (`installNoScriptSandboxPatch`), which holds for whatever document the frame holds, however it got there.
**That patch is deliberately skipped on iPhone and iPad** — WebKit then stops the iframe dispatching DOM events to our
listeners (WebKit bug 218086), which annotations and selection depend on — which is why the guard, the frame keeping
its chapter and the inert copies are the controls that matter there, and the sandbox is the belt. Android was measured
working without it: selection, marks, look-up, page turns, links and the hostile fixture.

### Links out of a book

**A link's text is the book's claim; its address is the fact.** Markup lets them disagree — text reading
`https://example.com/account` over an address on another site — and nothing else between a book and the system
would say so. foliate hands any address with a scheme to `window.open` from Obsidian's window, and Obsidian's desktop
app opens `http`, `https` and `obsidian` links without a word (it warns, with an "always open" checkbox, for other
schemes). An `obsidian://` link reaches the vault and any plugin that registers a handler.

**Enforced in `reader/LinkCheck.ts`**, from the `external-link` handler in `OrbisReaderView`, which cancels every one.
Converted-set book links (`obsidian://orbis-nav`) open directly. Every other link opens **Open this link?** first, as
rows of facts: **Link type** from the scheme (an `obsidian://` link with its action, such as `search`), **Domain**
where there is one, then **Link text** and **Link address** — the address as the browser will open it, the domain in
bold. Both are read with the URL parser `window.open` uses (`readLinkAddress` and `linkFacts` in
`reader/link-address.ts`), so `bank.example@elsewhere.invalid` has the domain `elsewhere.invalid` and a look-alike
letter shows as `xn--`. Cancel holds the keyboard; there is no setting, because a switch would hand the question back
to whoever made the book.

**Every kind of link a tap can read reaches the dialog, not only `<a href>`.** A chapter can hold three others: an
image map's `<area>`, an SVG `<a>` written with `xlink:href`, and a MathML element with `href`. foliate listened only
for `a[href]`, so a tap on one of the others went straight to its address in the chapter's frame — measured with
`fixtures/link-checks.epub`, rows 20 to 23: the chapter flickered or was left blank on every device, an image map's
`obsidian://search` ran a search on Android with no dialog, and iPhone and iPad followed a link on a formula. ORBIS
patch 23 has foliate find the link with **`findLink` in foliate-js's `view.js`**, which knows all four
shapes, so each takes the same road as `<a href>`: out of the book through this dialog, inside it to its page. A link
it cannot read at all — a `<use>` copy, an animated address — does nothing instead (see [A chapter stays in its
frame](#a-chapter-stays-in-its-frame)).

**Differences are reported as facts, never as a verdict** (`linkDeviations`), and only those that could still mislead
after the dialog has shown the link: link text naming a different site; characters outside basic Latin in the domain,
each named (such as Cyrillic `U+0430`) — decoded from `xn--` when the book wrote it already encoded, since the browser
treats both spellings alike and may show the letters in its own address bar after opening; and a name before `@`. Each
gets its own line, under the row it is about; any of them adds a plain sentence above the buttons and turns **Open**
to the theme's destructive color. In ordinary books the text comparison fires on links that are nearly all harmless —
a publisher's short domain over its full one, an author's site behind a store's name, a link shortener, an address
broken by a typo — and the name before `@` on mistyped email links (`http://name@publisher`). That is why the dialog
says what differs and not that a link is unsafe. **Hidden
characters** (direction marks, zero-width characters, stray controls) are not differences: the link text writes them
out as codes, and the browser drops them from a domain and encodes them elsewhere, so the rows already show the truth.
They get a grey note (`hiddenIn`) explaining the codes, and the text comparison ignores them, as the reader never saw
them.

**A `javascript:` link is refused, with a notice.** `hardenBookDoc` removes the address when the page loads and marks
the link (`SCRIPT_LINK_ATTR`), so `LinkCheck.watch` can say why selecting it does nothing; `readLinkAddress` refuses
one that arrives anyway. **`vbscript:` and `data:` links are refused the same way** by `readLinkAddress`, with the
same notice: each exists to carry code (a `data:text/html` address is a whole page with its own scripts), and no book
has a use for one. The guard leaves `data:` addresses alone elsewhere, since pictures, media and fonts use them; only a
link is refused. Found by CodeQL's first scan of the public repository (2026-11-16), which noted that the scheme check
covered `javascript:` alone.

What happens after **Open** belongs to Obsidian and the system, and differs by platform. Measured 2026-10-25 with
`fixtures/link-checks.epub`:

| Link | Mac and Windows | Android | iPhone | iPad |
|---|---|---|---|---|
| Email (`mailto:`) | Obsidian's own warning first, then the email app | The share sheet of email apps | The email app | The email app |
| Phone (`tel:`) | Obsidian's own warning | The dialer | Asks whether to call | Nothing |
| Obsidian (`obsidian://search`) | Obsidian search opens, with no warning | The same | The same | The same |
| File (`file:///`) | Obsidian's own warning | Nothing | Nothing | Nothing |

Obsidian's warning on the desktop reads *This link will open an external application outside of Obsidian. Only
proceed if you trust the source of this link.*, with an *Always open … links* checkbox; ticked once, it never asks
again for that scheme. The `obsidian://` row is the one this dialog matters most for: nothing else on any platform
asks before it runs.

### Book metadata reaching a file path

A title becomes a filename: chapter files, export folders, title notes, downloaded books.
**`sanitizeVaultName` in `src/vault-names.ts`** is the single rule — separators replaced with a space rather than
deleted (so `Part/One` reads as `Part One`), and a leading run of dots and spaces stripped, because `..` is not a
name but a direction. Each caller chooses only the length cap. A name is also one every device can write: control
characters, every format character (the marks that reorder or hide text, zero-width characters, the soft hyphen, the
tag characters — matched by Unicode category, not listed) and the blank Hangul fillers become spaces, a trailing dot
or space goes (Windows drops it, and
the file would be written under another name), and a Windows device name — `NUL`, `con.notes` — gets a `_` before it.

**A name is unique as it is written.** Two books' reading records get folders of their own (`recordBookName`): their
names are compared after sanitizing, cutting to length and ignoring case, as the Mac's and Windows' file systems do,
so `Sample: Book` and `Sample? Book`, or two long titles alike for their first 80 characters, get folders of their
own; two books whose whole paths are written alike get a short code from the path. The comparison is of each folder
and name, not of the name written out, so the ` — ` that joins them can still make two alike: `A/B — C.epub` and `A —
B/C.epub`, when books beside them make both need their folder.

**A link names its own book.** When a book is deleted or renamed, its title note is found by the link in it
(`linkNamesFile`), textually, since the file is already gone. A link with a folder in it matches that path only;
only a shortest-form link, which Obsidian writes when the name is unique, matches by name. A book of the same name
in another folder is a different book, and its title note is not trashed or re-pointed.

### Book metadata reaching a note's structure

**Only where Orbis builds structure by hand.** Reading-record properties go through Obsidian's own
`processFrontMatter`, which serializes the YAML itself and cannot be broken by a crafted title. Everything else Orbis
writes as frontmatter is assembled as a string — the title note, Save as Markdown's book, chapter and contents notes,
Export notes' chapter and contents notes — and **every value from a book goes through `yamlString`**: title, author,
publisher, language, a contents label, a link built from a file name. An unescaped newline continues the value at
column 0 — invalid YAML rather than a folded scalar — which makes Obsidian drop the entire property block; an
unescaped `"` ends the value early, and a trailing `\` escapes the closing quote. A line break in a title is rare, in
a contents label rarer still, and a `"` in a title is ordinary.

`yamlString` escapes quotes, backslashes and every character YAML 1.2 does not allow raw (`yamlForbids`): the C0 and
C1 controls and DEL, a lone surrogate, U+FFFE and U+FFFF — plus U+2028 and U+2029, which YAML 1.1 reads as line
breaks. Measured, Obsidian reads all of those back unchanged even raw; js-yaml, which many tools that read a vault's
notes are built on, rejects the whole block over a bare C1 character.

A value is written bare, as Obsidian's own editor writes it, only when `yamlScalar` can show YAML reads it back as
the same text: it starts with a letter or digit, holds none of those characters, no `: `, ` #` or trailing colon, and
is not a boolean, null or number. Anything else — every value a crafted title could use to break out of its line —
takes the quoted, escaped path.

**A title or contents label in a note's body is one line of text** (`bookTextLine`, `src/markdown-line.ts`): it
heads a note, a chapter or a contents entry, or is the text of a link to one in an exported copy, so whitespace
collapses to single spaces and a backslash, `[`, `]` and a `<` that could open a tag are escaped — the backslash
first, so the book's own cannot cancel the escape after it. Otherwise a label holding `<img src="https://…">` or
`![x](https://…)` fetches the picture each time the note is shown, and a line break ends the heading and starts
whatever follows. Obsidian turns every ASCII punctuation mark into a space when it matches a link to a heading, and
GitHub's anchors drop them, so links still land. The same escape covers running text in Save as Markdown, where
`<%`, Templater's tag, is escaped too.

**A book's web address in a link cannot end the link** (`linkDestination`, `src/export-links.ts`). Whitespace, control
characters, `<`, `>`, parentheses, the backslash and the backtick are percent-encoded and the address is written bare,
never in `<…>`, whose own `>` a trailing `\` escaped, so nothing after them becomes a picture or HTML in the note.
Only `https`, `http`, `mailto` and `ftp` addresses become links at all. **In a PDF export** the same four schemes are
the only ones linked (`pdfUriHex`, `src/pdf-uri.ts`), and the address is written in hex, of ASCII, so a `)` in it
cannot end the string and add keys to the link's action.

**A code block keeps its language only when it names a programming language** (`codeBlockLanguage`,
`src/turndown-rules.ts`). The language is what tells another plugin to run a block: ` ```dataviewjs ` from a book
would be a script Dataview runs when the note is shown. A block from a book is code to read, highlighted where
Obsidian knows the language, and never a query or a script: its fence is longer than any run of backticks inside it,
indented up to three spaces as a fence may be, so the book's code cannot close it and open a block of its own. Inline
code is written as the book has it, so `` `$= …` `` from a book is Dataview inline JavaScript where the reader has
turned that on in Dataview's settings.

**A contents label in a recording's playlist** is one line (`writeEditionPlaylist`): a line break in it would start an
entry of the book's choosing in the `.m3u`, which an outside player follows.

The same principle covers `RECORD_MARKER`, the line dividing what Orbis regenerates in a record from what the
reader wrote. It is located with `indexOf`, so a second copy arriving inside a selected passage would move it —
and the next regeneration would overwrite the reader's notes. Derived content is stripped of it, after its
whitespace is collapsed and until none is left, so neither a marker broken by a double space nor one nested inside
another comes out whole (`withoutMarker`).

---

### A book that freezes the reader

Nothing in a book may cost the reader more than time in proportion to its size. Three places in foliate did not hold
to that, and each is now a patch: the pattern that finds `url(…)` in a
stylesheet and the one that finds `vw`/`vh` took seconds over a few hundred bytes of crafted CSS, every time the
chapter loaded — so a book reopened at its last place froze Obsidian again on every launch — and three loops in the
MOBI/AZW3 reader never ended on a damaged or crafted file, which the library's scan also opens. More of the same
class are patches too: three EPUB patterns over the OPF's prefixes, processing instructions and `srcset` (patch 28),
and the MOBI/AZW3 reader's EXTH, index, NCX, HUFF and FDST loops (patch 29). ORBIS patches 24 to 29 in
the foliate-js fork's `ORBIS-CHANGES.md` say how each was measured and checked against the code it replaces.

Orbis's own code holds to it as well: the guard's stylesheet escaping (`escapeStyleText`) finds each `<` and counts
the backslashes before it, where a pattern rescanned a long run of them (256 KB: 27 s), and an FB2's cover is found
inside its `<coverpage>` element alone, with every tag read to a bounded length, where a pattern ran across the whole
file (16 KB: 22 s, during a catalog download). `crafted-book-freeze.test.ts` times each on the input that was slow.

**Memory is the exception, and it is accepted**. Nothing caps what a book's zip entry
inflates to, and deflate packs about a thousand to one. Measured on the desktop, a 262 KB EPUB whose chapter inflates
to 256 MB opens in 10 s and adds 2.9 GB to Obsidian's page, and an FB2 that refers to one 1 MB picture 256 times adds
3.5 GB, because foliate copies the picture's base64 into every reference. Cataloging and cover extraction inflate too,
when a download, the catalog review or a cover command runs them. An entry that only *claims* a large size costs
nothing: fflate allocates the claimed size, but memory is used only as it fills. On a phone, a few GB is likely to have
Obsidian's page killed, and a book left as the open tab would likely do it again at each launch, until the file is
deleted from another device. Accepted because it is no escape, it needs a file built for the purpose that the reader
chose to open or download, and no real book comes near it: a real book's entries reach tens of MB at most, compressed
a few times over, not a thousand.

---

## A catalog feed

A feed is a document written by whoever runs the catalog, and **every browse target and acquisition URL comes from
`resolveOpdsHref(feedHref, base)`** — the catalog writes them, not the reader.

| Risk | Enforced by |
|---|---|
| A scheme we have no business fetching (`file:`, `data:`, `javascript:`) | `resolveOpdsHref` and `nextHop`, both restricted to http/https |
| The reader's password sent to a host the feed named | `sameOrigin(target, source.url)` in `fetchFollowing` — anchored on the **source**, every hop |
| A password downgraded onto plain http | The same check compares scheme, host and port |
| A public catalog reaching into the reader's network | `mayReach(target, source.url)` — see `sources/private-hosts.ts` |
| A feed larger than any real catalog | An 8 MB cap, a 20 s timeout, a bounded redirect chain. On the desktop Electron's `net` stops at the cap as the body arrives; on mobile, and on the desktop's fallback to `requestUrl`, the size is checked once the whole body is in memory, and the timeout ends only the wait for it |
| A redirect obeyed before either check sees it | `requestHop` returns every redirect to `fetchFollowing` — Electron's `net` with `redirect: 'manual'` on the desktop, where `requestUrl` follows them itself |

**Both checks run on every hop.** On the desktop `requestUrl` follows a redirect inside Obsidian's main process, so a
check made on the URL Orbis asked for says nothing about the one that was fetched. On Android `requestUrl` was
measured handing each redirect back, so the checks see every hop there too. **On iPhone and iPad this is not yet
measured** — see *Limits worth knowing*. Only Book
sources needs this: every other request Orbis makes goes to an address it ships or the reader typed, where who chose
the address is not in question.

**Both checks are anchored on the source, not on the URL being requested.** For a redirect the requested URL is the
right question; for a URL the catalog supplied it passes by construction, because on the first hop the request
*is* the thing being compared.

The private-network rule is conditional, because the obvious rule breaks the main use case — a Calibre content
server on a LAN is the canonical self-hosted OPDS setup:

> A public catalog may not send you into your own network. A private one may talk to itself.

Credentials live in Obsidian's **`secretStorage`** (the OS keychain), never in `data.json`, so they do not travel
with a synced vault. An address shown in the debug log loses its `user:password@`, read to the last `@` before the
host as a URL parser reads it, and the value of any query parameter named like a credential (`forLog`).

---

## A downloaded asset

Piper's engine is not bundled: the ONNX Runtime module and the espeak phonemizer are fetched from CDNs at first
use, cached in the plugin folder, and instantiated in a Worker. **That is arbitrary code arriving over the network
into a privileged context.** TLS proves the bytes came from the host we asked; it says nothing about a compromised
CDN account or a cache file rewritten afterwards.

**Enforced in `reader/tts/asset-integrity.ts`**: SHA-256 pinned per asset, checked on download *and* on cache read.
The read check is the one that earns its place — a download happens once, a cache load happens every session.

Failure modes differ on purpose. A bad **cache** file is deleted and re-downloaded, which is right for the ordinary
cause (a truncated write). A bad **download** throws, because re-fetching the same URL produces the same bytes and
quietly running them is the thing being prevented.

**Voice models are deliberately unpinned**, both files of each: the `.onnx` and the `.onnx.json` beside it, which
names the voice's sample rate and phoneme table. Both are data fed to the runtime rather than code, and pinning
fourteen voices plus speaker variants means a table nobody can regenerate without downloading gigabytes. If ORT is
ever found exploitable through a malicious model, that file is where the answer goes.

**The two dictionaries are pinned on download only** (`sha256` on each `DictionarySource`): a file that does not
hash to it is refused and nothing is written. Not on every read, because a dictionary is data drawn as plain text —
a tampered file can show a wrong definition and nothing more. **Both digests are checkable against a source, not
only the host:** `pnpm build:wordnet` rebuilds WordNet byte for byte from the pinned Open English WordNet release, and
`assets/build-dictionary.py` rebuilds Webster's from the pinned commit in `assets/README.md`. The PDF export's fonts
are pinned the same way, on download (`pdf-fonts.ts`).

---

## A dependency

Policy, the ten shipping libraries, and the foliate-js fork finding are in [Dependency
Security](dependency-security.md). The short version: exact pins for anything that runs in the plugin or builds it.
`lamejs` is vendored in `src/vendor/`, and foliate-js comes from Orbis's own fork, pinned to a commit, so neither
comes from a third party's npm account — the npm `foliate-js` package is a third-party fork, not an upstream release. Each records the full upstream commit it matches,
and foliate's two pre-built bundles their SHA-256s.

**A release is built without write access and attested** (`.github/workflows/release.yml`). Installing, building and
writing the notes run dependency code in a job that can only read; a second job, which runs `gh` and nothing of the
repository's, drafts the release, and GitHub's build provenance ties each of its three files to the tagged commit and
the workflow that built it (`gh attestation verify main.js --repo <owner>/obsidian-orbis-reader`). The dictionaries
workflow is split the same way. A release is byte-reproducible: the bundle holds a hash of its source and nothing from git or the clock, so the same commit builds the same `main.js` ([Debug System](debug-system.md#build-stamp)).

---

## What Orbis deliberately does not defend

Naming these matters as much as the controls, because an unstated non-goal reads as an oversight later.

- **A reader against their own choices.** An export folder, a speech server address, a catalog URL: Orbis carries
  out what it is told.
- **Whoever can write to the vault.** Orbis's data files — `.orbis` and `.marks` files, recordings, sync files,
  settings — are vault files, and a value in one is the reader's choice, whichever device or collaborator wrote it.
  Someone able to plant one can already edit the reader's notes, or a plugin if the vault syncs its configuration, so
  a check on these files would protect nothing. What a damaged file must not do is stop Orbis loading or saving; that
  is a matter of reliability, handled where the file is read: a settings list entry of the wrong shape is dropped
  (`settleSettingsShapes`), an unreadable `data.json` is set aside and its backup restored
  (`readSettingsFile`), and a device's `.marks` record the rebuild cannot read is skipped (`usableRecord`). A few
  checks predate this and cost nothing, so they stay: `setTintedSvgIcon` sets a mark's color as an attribute value,
  `isSafeEditionKey` and `readManifest` keep a recording's names to the ones a recording writes, and `VaultSyncStore`
  keeps a sync record to the item its file name says.
- **Book content from the reader.** Annotations, notes and exports are the reader acting on a book. There is no
  integrity model for a book's text.
- **A book built to use up memory.** A zip entry that inflates a thousandfold, or an FB2 picture repeated, can cost
  gigabytes; see [A book that freezes the reader](#a-book-that-freezes-the-reader).
- **Cross-host browsing and downloading.** Gutenberg legitimately serves acquisitions off its own host. The
  proportionate answer is withholding credentials, not blocking the fetch.
- **The markdown-to-EPUB image fetch.** A note's `![](http://192.168.1.5/photo.jpg)` is unusual but legitimate, and
  the URL is the reader's own rather than a catalog's.
- **Anything requiring a confirmation dialog per ordinary action.** A prompt that fires on every Gutenberg download
  teaches people to dismiss prompts. Leaving a book by a link is not an ordinary action — few books have more than a
  handful — and **Open this link?** shows what the link holds rather than only asking.

## Limits worth knowing

- **DNS rebinding defeats the private-network rule.** A public hostname resolving to `192.168.1.10` passes a
  name-based check, and a renderer cannot resolve DNS to find out. Closing it needs a check at the socket, which a
  plugin does not have.
- **iPhone and iPad have no iframe sandbox.** By choice, for the event-dispatch reason above. The CSP, the stripping,
  the frame keeping its chapter and the inert copies are the whole of the defense there, which is why they are where
  the hostile and frame-navigation fixtures must be run. They are also where a frame inside a chapter, and a frame
  sent to a copy of the book's own document, ran a script; Android passed both.
- **Keeping a chapter in its frame rests on the Navigation API**, which Safari has from 26.2. On an older engine only
  a tap inside SVG is refused (ORBIS patch 27), and the inert copies are what stand between a route not yet found and
  a script.
- **A CSP meta governs only what follows it.** Hence the second layer.
- **`requestUrl` bypasses CORS**, by design and of necessity. Every URL handed to it is therefore a decision about
  trust rather than a technical detail.
- **The desktop's redirect check rests on `electron.remote`**, which Obsidian loads for itself and Electron has
  deprecated. Without it, Book sources falls back to `requestUrl`, redirects there go unchecked again, and the debug
  log says so.
- **Redirects on iPhone and iPad are not yet measured.** Book sources relies on `requestUrl` handing each redirect
  back, as it does on Android. If iOS follows a redirect itself, a public feed's redirect into the reader's network
  is not checked there, and whether a password crosses to the new host is the iOS network stack's decision.
- **The private-network rule reads addresses, not every spelling of one.** NAT64 (`64:ff9b::/96`), 6to4
  (`2002::/16`) and IPv4-translated IPv6 addresses are not decoded, `fec0::/10` counts as public, and local names such
  as `router.lan` or `fritz.box` pass. The worst case is a request whose answer the feed never sees.
- **A saved password follows its source's id, not its address.** If the address of a source changes, typed or synced
  from another of the reader's devices, the saved password goes to the new one without asking.
- **Open in browser** opens an address a feed chose, `http` or `https` only, and the browser shows it; Orbis does not
  show it first.
- **An `obsidian://orbis-nav` link opens a vault file without asking**, from a book or from a web page, and can start
  listening. It cannot write, delete or reach outside the vault.
- **Some slow patterns are left where only a crafted file and a deliberate action reach them**: MOBI6 text patterns
  over a whole decompressed book, and patterns in read-aloud and the exports that need Listen or an export started on
  that book. Each costs time in proportion to more than the input, not an escape.
- **Book text in the debug log's note can break out of its code fence.** The log and Write to note are both off unless
  turned on, for diagnosing.
- **`src/vendor/piper-phonemize.js` has no upstream version or hash recorded.** It is Emscripten glue copied from a
  package's build and reformatted, with no `eval`, `new Function` or remote address in it; the WASM it loads is
  pinned.

---

## How to check it still holds

| Check | What it covers |
|---|---|
| `pnpm build:hostile-epub`, then open it **on all three platforms** | Twenty-three checks: script in every place a book can put it, frames, a refresh, markup hidden as text that the frame would parse as markup, a chapter that must appear as itself, a chapter with no doctype, a book choosing the page color, and an escape to the host page. Every line must read PASS. Desktop passing proves least — it is protected twice |
| `pnpm build:link-epub`, then select every link **on all three platforms** | Twenty-three links: text that disagrees with its address, the `@` trick, a look-alike letter, invisible characters, a long address, email, phone, `obsidian://`, `file:`, script links, a book link, a link inside the book, and links that are not `<a href>`: an image map, an SVG `xlink:href`, a formula and an image map to `obsidian://`. Each row says what **Open this link?** should show |
| `pnpm build:frame-navigation-epub`, then select every shape **on all three platforms** | Ten links the link handler cannot read — `<use>` copies and animated addresses, aimed at a document, a chapter and an SVG file holding a script, an Obsidian action and a web page, one inside a `<label>` and one in a `<summary>` — and a form. Every row must do nothing; a failure that reached a script draws a red ESCAPED banner across Obsidian |
| `pnpm test` | The rules as pure functions: `book-html-guard`, `link-address`, `vault-names`, `private-hosts`, `asset-integrity`, note injection, the credential anchor driven through a stubbed `requestUrl`, the data-file checks (`svg-icon`, `recording-editions`, `sync-store`), and foliate's patterns and loops on crafted input (`foliate-css-patterns`, `mobi-loops`), the frame keeping its chapter with the copies that run nothing (`frame-navigation`), a book's text reaching the viewer, notes, PDFs and playlists (`book-text-out`), book names and their files (`book-names`), and slow patterns timed on the input that was slow (`crafted-book-freeze`) |
| `gh attestation verify main.js --repo <owner>/obsidian-orbis-reader` | A released `main.js` was built by the release workflow from the tagged commit |
| `pnpm audit --prod` | Production dependencies. Expected: 0 |
| A Gutenberg download **and** a Calibre download | The private-network rule in both directions — that it blocks, and that it does not over-block |

A regression test here is only worth what its failure proves, so each is confirmed by **reverting its fix and
watching it fail**. A test that has never failed is a description, not a check.

---

## The two mistakes this model exists to prevent

**An absolute claim nobody re-checks.** "Book content cannot execute scripts." "No data is ever sent to any
server." Sentences like these are written in good faith and go stale as the code moves. If a sentence here
promises something, the check that enforces it is named beside it — which is what the tables above do.

**A check anchored on the wrong thing.** A credential check that compares the request against itself passes by
construction; so does a reachability check; a note-merge boundary that trusts text from a book can be moved by it.
Each is a correct mechanism asked the wrong question. **Anchor on what you control — the source, the structure —
never on what arrived.**
