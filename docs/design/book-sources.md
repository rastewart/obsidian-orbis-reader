# Book Sources (OPDS)

← [Design Docs](README.md)

Connect to an OPDS catalog, browse or search it, and download books into a folder in your vault.

The switch and the sources list, the OPDS 1.2 parser, browsing with paging, categories and search, and
downloading with the title note written when the Library is on. What is deliberately **not** here is stated under
[What the Library adds](#what-the-library-adds-when-it-is-on) and
[Details settled by default](#details-settled-by-default).

---

## It is its own capability, not part of the Library

Book sources do not depend on the Library, for three reasons:

- **The gate a reader needs is the network, not the catalog.** What has to be consented to is *this contacts servers
  off your device* — the posture `epubFetchRemoteImages` already takes. Whether you keep title notes is an unrelated
  decision. Tied to `libraryEnabled`, the reader the library's own design names — the one who opens books from the
  file explorer and declines the library — could not download a book from Project Gutenberg for reasons that have
  nothing to do with cataloging.
- **The deliverable is a file, not a note.** A download's product is an EPUB in a folder you chose. The library's
  product is a note describing a title. Those are different features about the same subject.
- **Coupled, every download branches.** An independent module is a feed list, a parser and a write to the vault, with
  no collections, fields, arrangers or dashboards anywhere near the network path.

The precedent is [Reading Records](reading-records.md) and Listening: capabilities with their own switch, which the
library enriches when it is on rather than owns.

### What the Library adds when it is on

**A download writes a title note.** With the library enabled, a downloaded book is cataloged as it lands, and the
notice names both halves the way the rating and status dialogs do. Cataloging is how a title is found again later, and
a reader who has said "keep notes about my titles" has already answered this question; making them run the review
afterwards would be asking it twice.

**Through `catalogBook`, not beside it.** The downloaded file is on disk and its OPF is more authoritative than a feed
entry, so the note is written by the same function the review uses — which also extracts the cover, disambiguates a
name collision and writes the same frontmatter. The feed's metadata is the fallback for a format with no OPF, which is
what `catalogBook` already accepts as `known`. A second note-writing path would be a second shape of title note.

**Title notes for downloads only.** There is no "Save to the catalog" — a record for a book you have not downloaded,
an acquisition link and no file. The library could model it (a title whose file is optional is its first principle),
but a catalog you can browse in two taps is a poor reason to fill a vault with notes about books nobody has, and "I
might read this" is better said as a reading status on a title you actually acquired.

**A new note, never a match.** A download writes its own title note. It does not try to find an existing note for the
same book and attach itself to it: that is cataloging's matching problem carried over remote metadata, and it can be
added later without changing anything here. The cost to accept: downloading a book you already own gives you a second
note, and the cataloging review is where that gets tidied up.

**The cover comes from the file, and from the feed only if the file has none.** A downloaded EPUB almost always
carries its own cover, and extracting it is what cataloging already does — no request, and better artwork than a
feed's thumbnail. Fetching the entry's cover URL is the fallback for a file that has none, which keeps the extra
request rare rather than routine. The entry's full image before its thumbnail; a `data:` image is read where it is,
with no request; and only a book with neither gets the drawn tile (`extractCoverTo`'s `elsewhere`).

---

## The shape

1. **Sources.** One or more OPDS endpoints: a name, a URL, an enabled flag, optional credentials. An ordered list the
   reader can reorder, disable and extend — the look-up destinations pattern.
2. **A download folder** in the vault.
3. **Browse.** Open a source, page through it or search it, see title, author and cover.
4. **Download.** Pick a book; the file lands in the folder. With the library on, its title note is written too.

### Getting to it

**A ribbon icon that lists the sources you have configured**, and a palette command beside it. The icon is the entry
point because browsing a catalog is a thing you set out to do, like opening the Library — not something you reach for
from inside a book. It opens the list rather than a feed: which source you want is the first question, and a reader
with three of them should not have to remember which one the icon happens to open.

Each source in settings also has its own way in, so configuring one and looking at it are not two journeys.

The icon appears only when book sources are enabled, the way the Library's does — see [Turning it off](#turning-it-off).

### Browsing a source

OPDS feeds come in two kinds and the browser has to handle both: a **navigation feed** is categories you drill into, an
**acquisition feed** is books. Some advertise search through an OpenSearch description; Gutenberg's endpoint *is* a
search endpoint, so search is not optional there.

So: entries with a **Next page**, categories you can follow, and a search box where the feed says it supports one. Each
of those is one request from one tap, which is the rule this feature lives under.

### Downloading several

**Select what you want, then download the batch** — sequentially, one request at a time, with the row saying which is
in flight. A batch is still one user action, so it stays inside the robot-policy rule; what would not is downloading
anything nobody asked for, which is why nothing here starts on its own.

**A file already in the folder is not downloaded again.** It is skipped, and said so. A second copy of the same EPUB is
never what anyone wanted, and — with the library on — it would produce a second title note as well.

`src/sources/download.ts` runs the batch and `download-name.ts` decides what a file is called; both are separate from
the dialog because the rules are the interesting part:

- **Title and author, not the URL's name.** A real Gutenberg acquisition URL ends `.../<number>.epub.noimages` and
  Calibre's is `/get/EPUB/42/library`; neither is a name anyone would recognize in a vault. The first author only — four
  names make a filename nobody can read, and the note carries all four. Sanitized by the same function that names a
  title note, so a book and its note cannot disagree about what a filesystem tolerates.
- **Never overwrites.** A file already in the vault may be one the reader has started, with a position, marks and a
  note pointing at it, so a name that is taken gets `(2)` — and an exact match in the download folder is **skipped**
  and said so, since a second copy is never wanted and, with the library on, would mean a second title note. Compared
  case-insensitively, because one file on macOS is two on Android.
- **One at a time, and one failure never stops the batch.** A dead link in a feed should not cost the reader the other
  four books they asked for; every outcome comes back and the dialog reports the batch as one sentence.
- **The basket survives navigation inside a source.** A catalog makes you navigate in order to choose: Gutenberg
  publishes each book as its own document, so its list page has nothing tickable on it at all and a basket cleared at
  every step would hold exactly one book. It is cleared when the source changes, when a batch lands, and when the
  dialog closes, and the footer always says how many are in it, which is what turns a basket you cannot see into one
  you can. A **Clear** button appears beside Download as soon as there is something to clear.
- **An acquisition URL is resolved when the book is chosen**, not when the batch runs: an href means nothing without the
  document it came from, and by download time that page may be three navigations ago. So the basket holds a title, its
  authors, an absolute URL and an extension — everything a download needs and nothing that can go stale.
- **512 MB a book.** Generous on purpose — a scanned comic legitimately runs to hundreds of megabytes, and a limit that
  refused those would refuse the books hardest to get elsewhere. It is there for the URL that turns out to be a video.
- **Ten minutes a book, not a feed page's twenty seconds.** A large book over a slow connection takes minutes, and
  timing it out as "could not reach the source" told the reader the wrong thing. Ten minutes still ends a request that
  has died; **Stop** is for one that is merely slow.
- **Stop ends the batch after the book in hand** — a request in flight cannot be cut short — and the report says how
  many were not tried. Closing the dialog asks the same. **A vault that will not take a file is a failed line**, not a
  throw: before, it left the dialog on "Downloading…" for good.
- **An edition gets its own name** where a catalog publishes several under one title and author (`downloadEdition`,
  `quirks.ts`). Gutenberg's book without images becomes `… (no images).epub`; the edition with them keeps the plain
  name. Read from the download ADDRESS (`.epub.noimages`), not the feed's label, so one edition always gets one name
  and a second download of it is still recognized. Room is made for it under the length cap.
- **Three steps, not one: choose, confirm, report.** Downloading writes files into somebody's vault and fetches from
  somebody else's server, so the button that starts it opens a review — each book with the format and size it will
  arrive as, the folder they are all going to, and a way to take one off the list. A review you cannot act on is a
  delay rather than a review, and *Keep browsing* leaves the basket full, because that is what the reader is going back
  to add to.
- **It ends on a report, not a toast.** Each book says where it now lives
  (`Saved to Library/Downloads/Sample Book - Sample Author.epub`), a skipped one says where the copy it found already
  is, and a failure says why in the sentence its reason maps to. Failures lead, because that is the part with something
  left to do about it. **Continue** returns to the feed that was being browsed.
- **Nothing opens afterwards.** The report is where the paths are; opening five tabs would be a feature nobody asked
  for.

### Off until acknowledged

Off by default, behind an explicit acknowledgement that it contacts servers off this device. Nothing here reaches the
network until that is turned on — and the acknowledgement is the feature's switch, not a separate confirmation, so
there is one thing to turn on rather than two.

**Testing it again**: there is no `sourcesSetupDone` flag — the dialog is skipped when a download folder is already
set, so the folder is the record of having been asked. **"Reset book sources first-run (dev)"** in the command palette
(behind the dev-commands flag) switches the feature off and clears the folder, which is the whole of what the first run
writes. It leaves the configured catalogs alone: they ship as defaults, the first run neither creates nor touches them,
and wiping them would test a state no reader can reach.

### One request per action

Gutenberg's [robot access policy](https://www.gutenberg.org/policy/robot_access.html) says the site is intended for
human users, that automated access risks an IP block, and that the catalog endpoints are the sanctioned exception. So
the client is deliberately unambitious: **one request per user action**. No prefetching the next page, no crawling
ahead for covers, no background refresh, no polling. A catalog browser that behaves like a person is the one that
keeps working.

This is also why browsing does **not** go through the library's widgets: remote rows have different actions and
different paging, and satisfying this constraint through the arranger would drag collections and fields into the
network path. Browsing is a dialog of its own.

### Asking for one language

Gutenberg holds books in seventy languages, and a search for "Finn" comes back mostly Finnish. It can be asked: filter
terms go in the query itself, so `?query=Finn l.en` answers a feed retitled *"Books: Finn  Language: English"*, and
`?query=l.en` on its own reads as "everything, in English".

- **A per-source setting, not a global preference.** It is a fact about the catalog rather than about the reader: a
  Calibre server holds what its owner put in it and needs no filter. The row appears only for catalogs whose syntax Orbis
  knows — see `takesLanguage` — because a box that quietly does nothing is worse than no box.
- **One language, or every language.** `l.en l.fr` returns books that are in *both*, which is bilingual editions rather
  than either — so a multi-select would offer a filter nobody means. "Every language" is its own option and the default.
- **A picker of codes, named by `Intl.DisplayNames`.** The reader sees "French" in their own language, the list stays a
  list of ISO codes, and a typo cannot silently return nothing. A code stored but no longer offered keeps its place in
  the dropdown, so opening the dialog cannot change what a source asks for.
- **It goes into the request, not into a filter afterwards.** Gutenberg's search feed carries no language per entry —
  there is nothing to filter on what came back — and OPDS has no standard way to ask. Paging and categories inherit it,
  because the links a server builds carry the query it answered, and `withLanguageTerm` refuses to add a term that is
  already there so a filtered feed cannot accumulate `l.en l.en l.en`.

Both of these live in `sources/quirks.ts` with the refused-links list: knowledge about somebody else's server, in one
module that can be read, dated and deleted.

### The server's own words

A 401 carries a `WWW-Authenticate` realm, and it is often the one message written by somebody who knows the answer.
Standard Ebooks replies with `Basic realm="Enter your Patrons Circle email address and leave the password empty."`,
naming both the membership and the odd blank-password shape — neither of which Orbis could have known, and both of which
a reader needs. So a failure prints our sentence and then the server's, ours first because it says what happened and
theirs second because it says what to do.

Quoted and bare realms are both read; nothing useful means nothing shown, and the failure speaks in our words alone.
The same holds for a download refused in a batch: its line in the report carries the server's words after ours.

**Labeled as theirs: *The source says: “…”*.** The realm is whatever sits in front of the feed chose to write — a
sentence from Standard Ebooks, a bare name from a reverse proxy's `basic_auth` — and a bare name on a line of its own
read as a stray heading.

**The debug log never shows a credential.** A request that carried the keychain's says `(with credentials)`, and an
address typed with a `user:password@` in it is logged with them masked (`forLog`).

### What a refusal means

**403 is only about credentials when credentials were sent.** Gutenberg's search feed advertises facet links —
*Authors*, *Subjects* — whose OPDS endpoints answer **403** with or without a user agent, over either scheme: a link
their own catalog publishes and their own server refuses. Reported as a refused username or password, that reads as a
broken password on a public catalog nobody has an account for, and sends a reader to fix a setting that was never
wrong.

So `reasonFor(status, hadAuth)` splits them: 403 is a credentials problem **only when we sent credentials**, and a
403 on an anonymous request says *"The source refused that request. Some sources block what they publish — the ↗
button opens this page on their website."*

**401 is split the same way.** With credentials sent it is a refusal — *"The source refused the username or
password."* With none, it is a source asking for them — *"This source requires authentication."* — because the
refusal's words sent a reader to check a password they had never entered, and made the two cases look identical.
"Credentials" rather than "username and password", because Standard Ebooks wants only a username and its realm, on
the line underneath, says so.

Their 403 page says what it is: *"Sorry, but our website automatically denied you access to that page."* Bot protection,
not a retired endpoint — the books `.opds` search is served, the facet `.opds` endpoints are blocked, and the HTML
equivalents work in a browser. So the honest way out is **the feed's own `rel="alternate"` link**: every feed page that
offers a browser version has an ↗ beside its name, and the refusal message points at it.

Orbis does **not** rewrite `.opds` into their HTML path: guessing at how somebody else builds URLs is how a client
breaks the morning they change it. An `alternate` link is their answer to the same question, published in the feed.

**And the two rows are not drawn at all.** A row that always fails is worse than no row — it looks like a way in,
costs a request, and answers with a refusal. Which subsection a server will refuse cannot be known in general, but
these two are known. Orbis ships Gutenberg as a built-in and keeps its URL correct, so curating what its feed offers is
the same undertaking rather than a liberty.

`sources/known-issues.ts` is that list, and its shape is the mitigation for hardcoding somebody else's breakage:

- **Narrow.** Host **suffix** and path pattern, so `notgutenberg.org` and `gutenberg.org.example.com` are untouched
  while `m.gutenberg.org` is covered; everything else in the same catalog — the books search, a book's document, the
  next page — is left alone. A rule that swallowed those would hide a catalog to spare two rows.
- **Dated, with the reason in it.** Each entry says what it matches, why, and when it was last checked, because this is
  somebody else's behavior and it can change without telling us. If a rule starts hiding a link that works, deleting it
  is the whole fix.
- **Logged, not silent.** A hidden row is written to the `sources` channel, so "the catalog offered nothing" and "we hid
  two things" are never the same observation.

The refusal message and the ↗ both stay, because other catalogs will refuse other things — and a refusal we did not
predict is exactly the case those exist for. What does *not* happen is remembering a refusal: a second tap asks again,
which costs one request the reader chose to spend, and a server that was wrong once may not be tomorrow.

### The endpoints, as published

| Source | Endpoint | Notes |
|---|---|---|
| Project Gutenberg | `https://www.gutenberg.org/ebooks/search.opds/` | OPDS 1.x. **The XML feeds are expected to sunset in 2027**; an OPDS 2.0 JSON feed exists but is "contact us for access" |
| Standard Ebooks | `https://standardebooks.org/feeds/opds` | **Not shipped** — the reader adds it. **Every OPDS feed needs Patrons Circle membership**: the root and `new-releases` both answer 401, and the open `/feeds/atom/new-releases` carries no acquisition links at all, so it is an announcement feed rather than a download one. Authenticated as your email address with a **blank password**, which their realm string says outright |
| Calibre | The content server's own OPDS URL | OPDS 1.2. Reaches a self-hosted or local install, which is why reading its database file directly is unnecessary |

*Every row comes from published documentation and is worth re-checking at build time rather than trusted from this
table — the Gutenberg sunset in particular gives it a short life.*

### Parsing

OPDS 1.2 is Atom XML; OPDS 2.0 is JSON. One `OpdsFeed` shape — entries with title, author, cover link and acquisition
links by type — with a parser per format behind it. **1.2 first**, because it is what Calibre speaks and what
everything speaks today, and behind an interface because Gutenberg's sunset is dated.

Every fetch goes through `requestHop` (`src/sources/hop-request.ts`), which makes one request and **returns a redirect
instead of following it**, so CORS is not in the way and every hop comes back to Orbis to be judged. On mobile it is
Obsidian's `requestUrl`, which hands back the 302. On the desktop `requestUrl` cannot: Obsidian makes the request in
its main process with `redirect: "follow"` written in, so a chain is resolved before a plugin sees it — and a public
feed redirecting to `192.168.1.1` had its request made. So the desktop asks Electron's `net` directly, through
`electron.remote`, with `redirect: 'manual'`. It is the same network stack — system proxy, keychain certificates,
cache — where Node's `https` would ignore the first two; and measured on 100 MB it is quicker than `requestUrl`, not
slower. If Obsidian stops loading `electron.remote`, the desktop falls back to `requestUrl` and the debug log says
redirects are unchecked.

Catalogs do redirect: Gutenberg's OpenSearch description points at `m.gutenberg.org`, which redirects to `www`. Three
hops at most; only `http` and `https` are followed; and **credentials do not travel to another host**, because a
password entered for one server is not consent to send it wherever that server points this week. The URL a feed
*ended* at is what its relative hrefs resolve against, which after a redirect is not the URL we asked for. The size cap
is checked as the bytes arrive on the desktop, so an answer too large is cut off rather than downloaded and refused.

`src/sources/opds.ts` is pure, string in and object out, so every shape of real-world feed is pinned by a test rather
than by hitting somebody's public catalog to find out whether we read it correctly. Seven decisions in it are worth
knowing:

- **A parse failure is not an empty catalog.** `DOMParser` reports malformed XML as a document containing
  `parsererror` rather than by throwing, so without the check a broken feed reads as a feed with nothing in it — and
  the reader is told their catalog is empty. `null` means "could not read this"; an empty `entries` means "nothing
  here", which is a real answer.
- **Namespace prefixes are ignored**, matched on `localName`. Feeds differ about every prefix: Gutenberg writes
  `dcterms:issued`, Calibre writes `dc:creator`, and a selector naming either would silently skip the other.
- **A category is derived, not declared.** Nothing in OPDS marks one — a feed says so by an entry linking to another
  catalog document rather than to something acquirable. Calibre's navigation entries carry no `rel` at all. And an
  entry with *both* is a book that links to a series page, so following the link instead of downloading it would be
  the wrong action on a tap.
- **`issued` before `published`.** The first is the work's date — the year the book was written — and the second is
  the feed entry's own. A catalog record wants the work's.
- **`content` when there is no `summary`**, because that is where Gutenberg puts the only description it has.
- **Preference among acquisition links is a list, not a score**: EPUB, then azw3, mobi, cbz, fb2. A type absent from
  that table means a file Orbis cannot open, and `bestAcquisition` answers `null` so a row can say so *before* anyone
  taps it rather than after the file fails at the door.
- **Hrefs are left exactly as the feed wrote them.** Relative hrefs are the norm in Calibre's feeds, and resolving one
  needs the URL the document came from — which a parser has no business knowing. `resolveOpdsHref` does it, and
  answers `null` rather than throwing, so a malformed link drops one row instead of a page.

Search is two fetches, not one: the feed's `rel="search"` link points at an **OpenSearch description**, which carries
the `{searchTerms}` template. Optional parameters in it — `{count?}`, `{startIndex?}` — are dropped rather than filled
in, because inventing a page size is deciding how much of somebody's catalog to ask for.

### Credentials

`app.secretStorage`, keyed per source — `orbis-book-source-<id>-username` and `…-password`, derived from the source's id
so there is one place a credential can be and no field that could disagree with it. Neither half reaches `data.json` —
the file that travels when a vault is synced — and neither appears in a debug log. Standard Ebooks' membership feed
authenticates as an email address with a **blank password**, which is a real shape a credential row has to accept
rather than reject as incomplete.

**Sent as UTF-8**, as RFC 7617 says and Calibre's server expects: `basicCredentials` encodes `user:password` to UTF-8
bytes before the base64. `btoa` on the text alone sends an é as one Latin-1 byte, and throws on anything past Latin-1
before the request is made.

**A saved password is never read back into the edit dialog** — only whether there is one, shown as placeholder dots.
Anyone at an unlocked device could otherwise open a feed and read its password with the eye, and the page would hold
it. So the dialog asks for an intent (`CredentialEdit`): an empty field keeps the saved password, a typed one replaces
it, and **Remove password** — a button of its own, since empty no longer means empty — removes it. The username stays
visible: it says which account a feed signs in as, and it is not a secret.

**Removed means deleted from the store**, not stored empty: a cleared username or a removed password leaves the
Keychain entirely (`deleteSecret`), as deleting the whole source does, and is blanked only on an Obsidian without that
call. An entry left holding an empty string would be listed in Obsidian's Keychain forever, named after a credential
the reader thought they had removed.

**The key is folded to what `setSecret` accepts**, which is lowercase letters, numbers and dashes, and no more than
64 characters — it throws on anything else, and the throw would land inside a field's change handler, which is a
dialog breaking while somebody types in it. So anything else becomes a dash and the source id is cut to the 37
characters left between the prefix and a suffix (both suffixes are the same length by design, so there is one budget).
Neither guard can bite an id Orbis mints; both exist for one that arrived by hand-editing `data.json`. The cut needs
no handling of its own: two ids agreeing for their first 37 characters fold together, and a fold collision is what
`withUniqueSourceIds` already re-identifies the later source to break.

**The id is minted when the dialog opens, not when it saves.** The key derives from the id, so a source being added
needs its id before it can hold a credential: the caller mints `catalog-<id>` before opening the dialog and hands it
in, and the credential rows work the same for a new source as for an existing one.

The dialog holds both halves until Save rather than writing them on every keystroke, so **Cancel cancels an edited
password.** `saveCredential` writes only the halves that changed — an untouched blank writes nothing, because otherwise
opening a public catalog's dialog and pressing Save would leave two empty entries in the reader's Keychain, one pair
per source.

**Deleting a source removes its credential from the Keychain.** Emptying the value would leave two entries named after
a catalog that no longer exists: litter nothing in Orbis can clean up and nothing can match back to anything, since the
id that named them is gone. `forgetCredential` deletes them.

**On every device, not just the one that pressed Delete.** The catalog list travels and the credential does not, so a
merge that removes a source forgets its credential too — see `forgetDepartedCredentials`, including why it diffs what
the merge removed rather than sweeping the Keychain for orphans.

That needs `secretStorage.deleteSecret(id)`, which **the app implements and the typings do not** — `obsidian.d.ts`
at 1.13.1 declares only `getSecret`, `setSecret` and `listSecrets`, while 1.13.7 also has `deleteSecret` and
`peekSecret`, and the Keychain tab's own rename is a delete followed by a set. So it is declared *optional* on our own
narrow parameter type rather than reached by a cast: the fallback to emptying stays a branch the compiler can see, and
a runtime that really matches the typings degrades instead of throwing. That branch has a test.

**Both halves are typed into fields of our own, and NOT into Obsidian's `SecretComponent`.** That component's value is
the *id* of a secret the reader has linked, not the secret itself: `setValue(id)` displays a peek of the stored value
and its picker reports the id it chose. A password row built on it would store the *name* of the linked secret as the
credential.

`writePassword` puts plaintext in `app.secretStorage`, the same store the picker lists, with the same protection. The
picker's model — the reader names a keychain entry and links it — does not fit on two counts: it asks for two concepts
and three taps for one Calibre password, and it leaves the *username* nowhere, since a picker has nothing to say about
one. A credential is a pair and belongs in the dialog for the source it authenticates.
`readUsername`/`readPassword`/`writeUsername`/`writePassword` are shared by the dialog and the fetch so the two cannot
drift; the password is stored untrimmed (a space can be part of one) and the username trimmed (a stray space there is
always a slip).

**"Username", not "account name".** OPDS specifies nothing about credentials: it defers to HTTP, where this is Basic
authentication and RFC 7617 names the two parts `user-id` and `password`. Everywhere a reader has met it — a browser's
authentication prompt, Calibre's own content-server login — says Username. The secret key ends `-username` to match
the label: the dialog shows the source id read-only for exactly one purpose, matching a Keychain entry to the catalog it
opens, and a key that disagreed with the label beside it would defeat that.

### What downloading has to say out loud

- **Where the books go.** Named in the dialog that turns the feature on, beside the folder setting, on the screen where
  books are selected and again on the review — a folder is the one fact a download leaves behind, and the report says
  the exact path afterwards.
- **DRM needs no handling.** foliate-js opens plain EPUB; protected content fails at the door. Orbis does not and
  will not strip anything, and the interface should say that rather than let a failure read as a bug.

**And not the sync cost.** Nothing warns that downloads "sync to every device on your account". **Sync is optional**:
Obsidian Sync is a paid add-on, plenty of vaults are on one device or on somebody else's file syncing, and a plugin
asserting what a reader's vault does is a plugin telling them about a bill they may not have. The honest version says
where files go and leaves what happens to that folder to whoever configured it.

---

## Details settled by default

Not arguments, but they should be written down before they are discovered in the code.

- **Which acquisition link**, when an entry offers several: the types Orbis opens, EPUB first, then mobi/azw3/cbz/fb2.
  An entry offering only something we cannot read says so instead of handing over a file that will not open.
- **What the file is called**: title and author from the entry, with cataloging's own collision handling. An
  acquisition URL's filename is often useless — `download.epub`, or a bare id.
- **One download folder**, not one per source. Per-source is genuinely useful — Gutenberg to *Public domain*, Calibre
  to *My library* — and is additive later, so it is not a fork in the road.
- **After a download, nothing opens on its own.** The notice says what landed and, with the library on, that a note
  was written; a batch of five books that opens five tabs is a feature nobody asked for.
- **Which sources ship**: Project Gutenberg alone. A Calibre address is the reader's own server, and every Standard
  Ebooks OPDS feed needs a paid membership, so a shipped row would be one most readers cannot open — it would answer
  the first time they select it with a refusal. The [user guide](../guide/book-sources.md#add-standard-ebooks) shows a member how
  to add it.

---

## Turning it off

The acknowledgement is the switch. Off, nothing reaches the network, the ribbon icon and the command are gone, and the
settings beyond the switch itself go with them — the shape the Library's own switch has.

**Sources, credentials and the download folder survive being switched off.** Turning it off is "stop contacting
servers", not "forget what I configured": the reader who turns it back on next month should find their Calibre URL and
its password where they left them. Credentials live in `secretStorage` either way, so nothing about this widens what is
stored.
