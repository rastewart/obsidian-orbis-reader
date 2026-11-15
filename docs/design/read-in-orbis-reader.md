# Read in Orbis Reader

← [Design Docs](README.md)

## Why

Obsidian's Web Clipper takes an article or a post, strips the navigation and the advertising out of it, and
leaves a clean note in the vault. The reading has not started yet. Reading it in Orbis through *Save note as
EPUB…* means answering four questions about where it should go and how it should be cut, finding the file it
wrote, and opening that.

Every one of those questions is reasonable for someone exporting a book. None of them is what a person wants
between clipping something and reading it.

So: **one item in a note's context menu, and nothing asked.**

> **Read in Orbis Reader**

It converts the note to an EPUB beside it and opens it. No dialog, no confirmation, no folder picker.

**It names the plugin, and that is deliberate.** Orbis's other menu items do not — *Save note as EPUB…* names its
output instead — but a file context menu fills with items from every plugin in the vault, so an item has to
identify itself somehow. By its output or by its destination; this one has no output a reader cares about, so it
says where the note is going.

**And it has no ellipsis, because nothing is asked.** Its sibling *Save note as EPUB…* has one. That is the whole
distinction between them, visible in the menu without reading a word of documentation.

## Why an EPUB at all

The EPUB is a means, not the point, and it is worth being explicit about that because it is what justifies a new
file appearing in someone's vault.

Making one buys **annotations, CFIs, reading position, display styles, the audio player, reading stats and
reading records** — every one of them addressed to a book. A reader that rendered Markdown directly would be a
second engine with none of that, and highlights would not survive a reload.

The file is the price of reusing the whole reader. It is a fair one.

---

## What happens on each invocation

### Finding the books

Everything below depends on one question: **how does Orbis find the book that belongs to a note?**

**Derive by convention, confirm by the origin file.** List the note's folder for EPUBs whose basename matches,
then read each candidate's `!orbis-data/<book>.origin.json` and keep the ones naming this note. One folder
listing, and the origin file is what actually decides — so an unrelated EPUB that merely shares the name is never
mistaken for ours. See [The origin file](#the-origin-file) for why it is not the `.orbis`.

**Renaming or moving the note breaks the link.** The next invocation then makes a fresh book, and the old one
keeps its annotations, orphaned but intact. Nothing is lost and nothing is wrong, but nothing is connected
either.

### Deciding what to do

One comparison settles it. **A *match* is a book whose recorded hash equals the note's hash right now.**

```
Is there a match?
├─ Yes → open the newest match                          silent
└─ No  → are any of the books annotated?
         ├─ No  → replace it, open the new one          silent
         └─ Yes → ask, listing every annotated version
```

**"The newest match" handles a case that is easy to miss**: edit a note, keep a version, then undo the edit. The
note is now identical to a book that already exists — so that book *is* the note, and it opens. A match always
wins, even when an annotated book that no longer matches is sitting beside it.

**"Replace it" means the LATEST version, and only when that one is unannotated**: once a version has been
surpassed by a newer one, it is ignored. Replacing "the newest unannotated version" instead would pick an older
one the moment a reader empties it — delete every annotation from v1 while v2 is annotated and a create would
overwrite v1, producing a Version 1 newer than Version 2 and breaking the one thing the numbering exists to say.
The cost is an orphan: a surpassed version you have emptied is never reused and simply stays in the folder. An
unused file is harmless; recycling the wrong slot is not.

Everything orders by **version number**, not by the origin file's `created`: the newest match, the dialog's
list and which version may be replaced are one comparison rather than two, and two versions made in the same
second still come out in order.

**The only question the feature ever asks** is the one at the bottom, and it is asked because the alternative is
to silently strand work someone did:

> **This note changed after the book was created**
>
> Open an existing annotated version:
>
> | | |
> | --- | --- |
> | **Version 2** <br> 9/21/2026 · 3 annotations | **[Open]** |
> | **Version 1** <br> 9/18/2026 · 1 annotation | **[Open]** |
>
> A new version of the book will have the note's current text but none of the annotations.
>
> **[ Create a new version ]**
>
> Existing versions are kept either way.
>
> ---
>
> **[Cancel]**

**Every version is a row, even when there is only one.** A row says what a button can only describe: *Open the
annotated book* tells you there is one, where a row tells you which version it is, when it was made and how much
work is in it. One shape for one version or several also means neither surprises a reader.

**A picker is acceptable here and nowhere else.** By the time a second version exists, the reader chose to keep
one: they left the no-questions path deliberately, and they are now the only one who knows which reading they
want to continue. Guessing on their behalf — newest, or most-annotated — would be picking for them in the one
situation where the whole point is that they had a preference.

Every part of the wording is load-bearing:

- **The title names the reference point.** "This note has changed" alone does not say *changed relative to what*,
  which is the whole reason there is a decision to make. It says *after*, not *since*: *since* describes a gap
  that is still open, which is true but wordier than the fact a reader needs.
- **"created", not "made" or "generated".** *Generate notes* is already a command, so a generated book would
  imply a relationship to it that does not exist. And **created** in the title matches **Create** in the button:
  the same verb for the same act, so the button reads as doing again what the title says already happened.
- **One word for one thing.** **A new version of the book** is the first appearance of *version*, and it says
  what a version is *of*; every other line inherits the term, so the dialog never offers "a new book" over a list
  of versions.
- **No count in prose.** The rows carry the annotation count — per version, where it is accurate rather than
  summarized — so the sentence says only the consequence and needs no plural at all. The only plural left is the
  title's, because *the book* is wrong with three of them.
- **Each lead-in sits with what it introduces**: announce the list, show it, explain the alternative, offer it.
- **"Existing versions are kept either way", standing alone and last.** Nothing is destroyed on either path, and
  this is where the hesitation would otherwise sit. It comes after both choices because it is about both. It is
  the difference between a question answered in a second and one somebody stops to think about.
- **Neither action is a call to action.** Both outcomes are legitimate, so marking one would nudge a decision the
  reader is better placed to make — and the rows cannot be marked, so a `mod-cta` on Create would be the dialog
  quietly recommending the one outcome that adds a file.

**Create sits in the body, not the footer** — the one deliberate break from house style here. This dialog has
N+1 choices where N of them are rows, so *Create a new version* is the last choice rather than a footer action.
The footer holds Cancel alone, and the rule then reads "above: what you can do; below: leave".

**The dialog does not name Orbis Reader.** The menu item does, because a file context menu fills with items from
every plugin and one has to identify itself; inside our own dialog the reader is already here, and an app
referring to itself in the third person reads like a system notification rather than the thing in front of them.

The threshold is the one reading records use: deleting an annotation deletes its reading record **unless you have
invested in it**. Annotations are the same signal here.

### Change detection

**Hash the body below the frontmatter, trimmed** — not the file, and not its modification time.

- **Not the file.** A clipper that stamps `last-modified`, or Obsidian adding a property, would announce that the
  note had changed when nothing a reader would notice had. A prompt that cries wolf is worse than no prompt.
- **Not mtime.** In a synced vault, mtime is the first casualty.
- **Trimmed**, because trailing newlines are added and removed by everything that touches a Markdown file.

Hashing the *conversion input* rather than the *file* also means the answer is the same on every device, which
matters because the book may have been made on one and opened on another.

---

## Where it goes and what it is called

**Beside the note, and not configurable.**

A destination folder would let `Clippings/Sample Book.md` and `Archive/Sample Book.md` both want `Books/Sample Book.epub`.
Identity lives in the sidecar, so the *program* would never confuse them — but the **person** would, looking at
`Sample Book.epub` and `Sample Book 2.epub` in one folder with nothing to say which is which. And every fix means
encoding the note's folder into the filename, making every name uglier to solve a problem most people will never
have.

Obsidian guarantees two notes in one folder cannot share a name, so putting the book beside its note makes the
collision **impossible by construction rather than resolved by convention**.

Other conversions offer a destination (`bookPdfSameFolderAsBook` / `bookPdfFolder`, through
`pdfDestinationRows`), and this one deliberately does not: **the other conversions never have to find their
output again.** This one does, on every invocation. That makes location part of the mechanism rather than a
preference, and mechanisms are not settings.

**The first book takes the note's name, unadorned:** `Sample Book review.epub`.

A second version — which only exists because someone asked for one at the prompt — is numbered:
`Sample Book review - v002.epub`, then `- v003`, zero-padded to three digits.

**Numbered rather than dated**, because a number says which came first outright; a dated name beside a plain one
asks the reader to know that *the undated one is older*, which is backwards from how anyone reads a folder.

- **Numbering starts at v002, because the plain name is version one.** A second file called `v001` would be a
  "version 1" that is not the first.
- **Padded to three digits** so they sort the way they read — `v010` after `v009`, not between `v001` and
  `v002`. The same device chapter notes' `006 - PART I` prefixes use, for the same reason.
- **A timestamp on every book is invisible precision.** A name like
  `notename-conversion-20260920143722.epub` appears in the file list, in the Library, in the title note's name and
  in every reading record's filename, and nobody tells two books apart by their seconds. Most notes never get a
  second version, so most books simply have a clean name. **The date is not lost**: it is in the origin file,
  which is where the dialog reads it from. A filename is a name; `created` is a fact about the book.
- **The naming scheme is not a setting.** It would read as flexibility and deliver *why is my file called that* —
  a control most people never open and cannot undo the effects of. One scheme, explained in the guide.

**The next number is one past the highest that exists, not the lowest that is free.** Delete `v002` and make
another version and you get `v004`: a number that meant two different readings at two different times is the
thing numbering exists to prevent.

**An old book is never renamed to tidy up.** Renaming would orphan nothing — `main.ts` listens for Obsidian's
rename event and `moveOrbisSidecars` carries every sidecar of that file, its recordings folder, the reading
records and any links — but a book quietly changing its name while you are deciding something unrelated is a
surprise not worth introducing.

### Collisions

Two notes cannot collide — that is what putting the book beside its note buys. What remains is a file of that
name that simply is not ours: something the reader made, or an earlier export.

**Never clobber it.** The origin file is what distinguishes a book this feature made from a file that merely
shares its name, and a name already taken by a stranger is answered the way a second version is — by taking the
next number instead.

---

## The Library, and where provenance lives

These books belong in the Library, and a title note is written when the Library is on — they are things you have
and are reading, which is the whole definition.

The **Type** field is a setting, defaulting to **`obsidian-note`**, because **these are not books** and Orbis
should not say they are. A clipped article, a recipe, a set of meeting notes — the reader knows what they are
converting and Orbis does not, so the default names the one thing that is true of all of them and the setting is
there for anyone who wants to be more specific. An emptied field means the default, as its hint says — not Save note
as EPUB's `book`, which is what the shared converter would otherwise fill in.

It overlaps with `source: markdown-note`, which the record already carries, and that is fine: `source` is
machine-written provenance and `type` is a shelf someone filters on. The same fact serving two audiences is not
the same as saying it twice.

That sits correctly with `library/fields.ts`, whose built-in Type list is deliberately the single value `book`:

> Only `book`, because it is the only medium Orbis ever writes. A reader with a DVD shelf, a magazine rack or a
> folder of whitepapers names those themselves — a list of media we imagined would be a list of guesses.

The rule there is against *Orbis* inventing a vocabulary of media. A setting is the reader naming it themselves,
which is the thing that comment points at.

**But the program must not key on Type.** It is the reader's field, editable at will, and the moment change
detection or anything else depends on it, someone retypes it while tidying their Library and the feature quietly
stops recognizing its own books.

### What the title note already does

`writeConvertedTitleNote` is shared with *Save note as EPUB*, and gives these books three things:

- **The clipper's URL.** Obsidian's Web Clipper writes the page's address into the note's `source` frontmatter,
  and `main.ts` reads it and writes it to the record as `source_url`, where the Library offers it as
  **Open source**.
- **`source: markdown-note`** on the record, which is how the Library can tell these apart from books bought or
  downloaded — without Type having to carry that meaning as well.
- **`source_notes`**, a link back to the note.

**None of that replaces the origin file.** The Library can be off, and frontmatter is the reader's to edit; the
origin file is the authority and the title note is a description. But they must agree, and the title note is
written from the same values.

### The origin file

**Provenance goes in a file of its own**, in `!orbis-data/` beside everything else a book carries:

```
!orbis-data/
  <book>.orbis                      annotations          written by the reader
  <book>.location.<device>.json     position             written by the reader
  <book>.pages.json                 locations cache      written by the reader
  <book>.origin.json                which note it came from
```

**It cannot live in the `.orbis` file.** That file is written by the *reader*, so a book that has been created and
never opened does not have one — `hasSavedContentFor` returns false on its absence. Provenance has to exist from
the moment the book is written, which is before the reader has ever seen it.

What it holds:

| | |
|---|---|
| `note` | the source note's path |
| `hash` | the body below the frontmatter, trimmed, as it was at creation |
| `created` | when |
| `feature` | that this feature wrote it, so a later one can write its own origin without collision |

**Not named `source`.** A *source* in this product is where books come from — OPDS and its kin — and giving one
word two meanings in one vault is how a vocabulary stops being teachable.

**Renames are handled like any sidecar's.** `moveOrbisSidecars` moves every sidecar of the book, so the origin
file travels with it. Deletion has the same reach. The reset command spares it, as it spares `.orbis`, since
provenance is not a per-device cache.

**`readSidecar` ignores it.** It classifies `data`, `location` and `audio` for the Library's state map and
already ignores `.pages.json`; an origin file is not state the Library shows.

Invisible, and not something a person can break by tidying.

---

## Settings

**Under Reading behavior, not Conversions.**

Technically it is a conversion. But you are not configuring the conversion; you are configuring **what reading
feels like when you trigger it**, which is Reading behavior's subject. Two of the three settings are purely about
the reader.

And **opening a book at all has the same two settings**. If one pair lived under Reading behavior and the other
under Conversions, a reader who found one would reasonably assume it governed both. Side by side, the distinction
is visible.

**The Type goes with them, although it is the one shared setting of the three**: one row of a capability is not
orphaned to satisfy a taxonomy nobody can see. `libraryUncatalogedAlert` is per-device and sits on the Library
page beside shared folders, and `bookSourcesEnabled` is per-device consent beside a shared catalog list. **Orbis
groups by capability, not by storage.**

**The conversion code does not separate.** `markdown-epub.ts` stays the single implementation. A second path
through it would let a fix in one stop reaching the other — the failure the shared settings prevent, but in the
code rather than in the settings.

### Three rules, and no merging

Two pairs of settings and a switch could have been a merge table. It is three rules read in order:

1. **A control that names a mode wins.** The Library's headphones and a `listen=1` link are instructions, not
   preferences; if the base setting could override them the button would stop doing what it says.
2. **Opened by this command** → its own settings, or the base ones whole when it is set to follow.
3. **Anything else** → the base settings. Every open there is: a click in the file explorer, a link, a workspace
   restoring three books at startup.

The base pair defaults to **Standard mode · No bar**, the plain reader, so no book opens in a mode nobody chose.

### What it holds

Under **Reading behavior → Opening a book**, governing every open:

| Setting | | Default |
|---|---|---|
| **How the book opens** | Standard mode · Focus mode · Full-screen audio player | Standard mode |
| **Open with** | Listening bar · Search bar · No bar | No bar |

and inside **Read in Orbis Reader**, the drill-down beside them:

| Setting | | Default |
|---|---|---|
| **Change how the book opens when using Read in Orbis Reader** | a switch | off |
| **How the book opens** · **Open with** | as above, shown only while that switch is on | Standard mode · Listening bar |
| **Type** | the default written into new books | `obsidian-note` |

**One switch rather than a third option on each dropdown.** Overriding the mode while following the bar is a
half-state that is hard to read at a glance and that nobody wants, so one decision replaces two — and the rows
hide rather than gray while it is off.

**It is named for what turning it ON does**, like every other toggle in these settings: switching it on reveals
the two rows. The stored key, `readInOrbisOwnSettings`, has the same polarity as the control: a flag whose name is
the opposite of the control bound to it is a bug waiting for whoever reads it next.

**The entry shows what it is set to, but only while the switch is on.** Following, the answer is literally the
two rows above it, and repeating it there would read as a second setting that happens to agree.

**"No bar", not "Nothing".** *Open with → Nothing* reads as a shrug rather than an answer, and *No secondary bar*
would teach a word the interface never uses elsewhere. All three options ending in "bar" is what makes them read
as one question.

**"Open with", not "toolbar".** The toolbar is the row of icons at the top of the reader; what this chooses is
which *secondary bar* opens. Borrowing the toolbar's name for something else is how a vocabulary stops being
teachable.

The row **hides** rather than grays when the full-screen player is chosen: a bar over a full-screen player is not
a choice with a wrong answer, it is a choice that does not exist there, and a hidden row says that where a grayed
one invites you to wonder what you did wrong.

**The audio option needs a voice, and the player already asks for one.** `maybeOnboardThenOpen` is a first-voice
gate every route into listen mode passes through (the asking itself is `tts/voice-gate.ts`) — an undownloaded Orbis voice opens `FirstVoiceModal` (Download
& Listen, Browse voices, and on desktop and iPad Use a system voice); the system source shows a one-time hint.

**Dismissing `FirstVoiceModal` without choosing still leaves a way out.** Entering listen mode hides the text and
shows the full player *before* the async gate resolves, so dismissing it leaves the player up and the bar
withheld. The way out is on the **player**, not the bar: `buildPlayer` puts the `orbis-tts-player-collapse`
chevron — *Show text* — on the player itself, and `setTextHidden(true)` hides the bar anyway, the full player
replacing it. The only rule that hides that chevron is `.orbis-tts-player.orbis-locked`, which is pocket mode and
takes focus mode, the full player and a deliberate lock to reach.

**Withholding the bar until the gate passes is what keeps the chevron reachable**: `doOpenBar`'s warning —
showing the bar early "paints over the full player, and over the chevron that gets you back to the text:
listening with no way out" — describes what that guard prevents.

### Opening in a mode

`startListeningTo(app, file)` opens a book straight into the full-screen player, and every open mode works the
same way: **the view does not exist when the request is made**, so the request is left in a module-level record
(`pendingIntents`, a `BookOpenIntent` per path) that `onLoadFile` consumes, and the page is held invisible
(`orbis-open-pending`) until it is ready — otherwise there is a flash of a blank book.

Focus mode rearranges the same chrome and carries the same flash risk, so it is applied the same way rather than
after the book has painted.

**One pending record, not a set per mode.** Two sets that must not disagree about the same book, consumed in the
same place, is how they come to disagree.

### Which settings sync

> **Settings that decide what is written into the vault are shared. Settings that decide what this device does
> with it are per-device.**

| Per-device | Shared |
|---|---|
| How the book opens — both pairs | Default Type |
| Open with — both pairs | |
| Whether this command sets its own | |

Destination and naming are absent from both columns because neither is a setting: the book goes beside its note
and takes its name, for the reasons above.

The rule comes from the case that proves it: **read on the tablet, listen on the phone.** That is not a
misconfiguration to be reconciled, it is two devices being used for what they are good at.

Type is shared because it writes into a title note that every device reads, so a device-local default would put
the same book under two Types depending on which device made it.

**`sync/shared-settings.ts` is a hand-maintained list, and a new setting is shared unless someone remembers to
exclude it.**

---

## First use

**Nothing at all.**

**No first-run dialog**: a modal interrupting the first use of a command whose entire promise is *no questions*
would be the feature arguing with itself, and it arrives at the moment the person wants to read rather than to
configure.

**No first-use notice either.** A notice would exist only to say "this opened differently from what you would
expect, and here is where to change that" — and by default the command follows the base settings, behaving like
every other open, so there is nothing to explain and a notice would be an advertisement for a settings page. **A
feature that needs to explain itself on first use is usually a feature with a default nobody chose.**

---

## Feedback while it works

**A progress dialog that appears only after a delay** — 400ms (`withDeferredProgress`). Below that threshold
nothing appears and the command feels instant, which is the promise; above it, a long article gets something to
look at.

A dialog that flashes for 200ms is worse than none. It reads as a glitch.

**No Cancel.** The converter cannot be aborted mid-run, so a Cancel button would hide a dialog while the book
appeared a moment later anyway, which is a small lie told by the UI.

Failures need a Notice, because the command has no dialog of its own to fail inside; the reason goes to the debug
log. So does the conversion's duration, which is what tells the threshold doing its job apart from a dialog that
never shows.

---

## Scope

**Markdown notes only.** Not canvases, not PDFs, not the EPUBs themselves.

**Not folders.** *Save folder as EPUB…* already lives in the folder menu and two folder items that both make
books would confuse both of them.

**The command palette gets it too**, acting on the open note — same command, same behavior.

**If the book is already open in a tab, focus that tab** rather than opening a second one.

**Deleting the note does not delete the book.** The hash link makes them feel coupled; they are not.

---

## What was considered and dropped

**No automatic cleanup of old books.** An unannotated book whose note changed is replaced in place, so a note
never accumulates them; the only way to have several is to have chosen one at the prompt. What is left is one book
per thing you have read, and those are not clutter to sweep — they hold reading positions, title notes, possibly
ratings, and backlinks from other notes. Automatic deletion there is silent data loss on a vault that syncs, where
the phone could delete what the tablet is reading. **The design already prevents the problem; a cleanup could only
cause one.**

**Annotations are not pushed to a notes file so the book can be replaced.** It loses more than it saves: the
generated notes file's location links would point into a book that no longer exists, so the reader could no
longer jump back — which is most of what reading records are for.

**One command, not one for reading and one for listening.** The open-mode setting already spans both, so a second
command would duplicate the entire settings block to change one radio button. If listening needs to be reachable
without a trip to settings, it can be a **palette-only** command that overrides the mode for that invocation —
no new settings, no first-run impact, and it stays out of the file menu where two near-identical items would be
the real cost.

**Rendering Markdown directly in the reader**, with no EPUB. See [Why an EPUB at all](#why-an-epub-at-all).

**No destination folder setting** — see [Where it goes](#where-it-goes-and-what-it-is-called). It is listed here
because "why can't I choose where these go?" is a reasonable question and the answer is a design decision rather
than an omission.

---

## Deferred

**Choosing an annotation preset for books made this way.** Presets are already per-book with a default, so this
would write the book-preset link at conversion time. It is deferred because it is the one item here that is a
preference rather than a necessity, and because it is not yet clear whether clipped articles want different marks
from books.

---

## Settled: reading position does not survive re-conversion

**Re-clipping an article to the same note and reading it again starts at the beginning.**

Carrying the position across would mean one book with a replaced spine rather than versioned files — which would
force a different answer to the annotations question, since there would be nothing to choose between.

And **a changed article is a different article.** A clipped piece that has been re-clipped has been edited,
corrected or extended by someone else, and the paragraph you stopped at may not be there any more. Starting at the
beginning of a text you did not finish is honest; landing 40% into a document whose middle has moved is not.

---

## See also

- [Markdown to EPUB](markdown-to-epub.md) — the converter this uses, and the three shapes it already has
- [Reading Records](reading-records.md) — what the annotations on these books become
- [Multi-device sync](multi-device-sync.md) — the machinery behind the shared/per-device rule
- [Library](library.md) — title notes, Types, and what these books look like on a shelf
