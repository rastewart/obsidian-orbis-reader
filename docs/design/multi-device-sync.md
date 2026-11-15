# Multi-device sync

One rule for every piece of data that travels between devices: `data.json` is the truth on this device, and the vault
holds a **published copy per device**. No file is ever written by two devices, so nothing ever has to be merged by the
sync tool underneath. The reading-location files already have this shape; this design generalizes it.

**Why build it at all, when a reader can simply sync `data.json`?** Because that file is one merge unit. Rename a
dashboard on the Mac while adding a collection on the phone, and one of those two is lost — not through any fault,
but because the unit of comparison was the whole file. Publishing one file per item makes the merge unit the *item*,
so both survive and a collision costs only the thing actually touched. **A granular sync is not a richer sync; it is
a less brittle one**, and every piece of machinery here — versions, a clock, tombstones — buys exactly that. Both
models work, and neither is a fallback; see *Two ways to sync*.

---

## Why

Three problems, one cause.

**Two devices writing one file is a conflict.** A dashboard list, a collection list or a field table kept as one
shared file that every device writes is a conflict the sync layer has to resolve, and Self-hosted LiveSync resolves it
by blocking the write or by merging two JSON documents into something neither device meant. Prompts like "this was
changed on another device", "keep theirs or keep mine" and "restore the missing dashboards" exist only to paper over
that one decision.

**The bookkeeping to avoid those prompts is itself a bug farm.** Stamps recording which writes were this device's
own, verdict functions per file, a snapshot taken before each write so a rename does not accuse this device of being
another one — machinery of that kind still ends up asking about writes the device made itself.

**Durability has to run one way.** If `data.json` is written first and a shared file second, but at load the *file*
wins, a change that reached `data.json` and not the file is lost on the next reload.

Making the files derived rather than authoritative dissolves the third problem, and one-writer-per-file dissolves the
first two.

---

## The rule

1. **`data.json` is the source of truth on this device.** Every read comes from it. Nothing on screen waits for a
   file.
2. **Anything syncable is also published to the vault**, as one file per item per device, named with the device id.
3. **A device only ever writes its own files.** It reads everyone's.
4. **On a scan**, for each item, the newest version across all devices wins. If it is not ours, we adopt it into
   `data.json` and republish it **with the timestamp we adopted**, not with `now()` — the adopted copy is the same
   version, not a newer one, and stamping it `now()` would make two devices hand the same item back and forth
   forever.
5. **Nothing is deleted; it is tombstoned.** A delete is a version like any other, and it has to be able to win.

The whole of it is idempotent: a scan that runs twice, or crashes between adopting and republishing, converges the
same way.

---

## What participates

A whitelist, not a default. Per-device state stays out — syncing it is how a phone ends up reading with a desktop's
font size.

**The line is what the thing is ABOUT.** Something you built that describes the vault's contents travels: a dashboard
is the same dashboard on every device. Something that describes *this device* — its screen, its voices, its chrome —
does not, however much it looks like a setting.

| Travels | Stays on the device |
|---|---|
| Library dashboards, collections, the field table | The active dashboard |
| Display styles (the named ones) | The device-default style, and which style is active |
| The reader themes list: its order, its switches and the reader's own themes | |
| Note export styles | The toolbar's buttons and the progress readouts |
| Export defaults: book export, Marks → PDF, note-to-EPUB | Reading behavior: page-turn keys, flash navigation, link preview |
| The pronunciation glossary | Book sources' consent switch and their credentials |
| Look-up sections and web destinations | Voice preferences (`voicePrefs`) |
| **Where things are written, and whether they are written at all** | Recording/generation config (`localStorage`) |
| | The Piper cache and downloaded voices |
| | Debug flags, panel state, the device id and name |

**Reading behavior is device-shaped**, though it does not look it: keyboard page-turn means nothing on a phone,
flash navigation is about how a screen feels, and link preview is a hover. Each describes the device.

**Book sources split three ways, and each part goes where it belongs.** *May Orbis contact this server* is a decision
about a device on a network, but *which catalogs exist* is a fact about a vault, and re-entering three OPDS URLs on
every device is precisely the annoyance this whitelist exists to remove.

- **The catalog list travels** — `bookSources`, with each source's name, URL, language and enabled flag.
- **Consent stays** — `bookSourcesEnabled`, in device storage, so a phone on a hotel network has not agreed to
  anything by virtue of the desktop having agreed.
- **Neither half of the credential is in `data.json`.** Both are keyed `orbis-book-source-<id>-password` /
  `-username`, named so that a reader meeting them in Obsidian's own secret list can tell what they are.
  Reader-created sources are `catalog-<id>` for the same reason, and the dialog shows a source's id read-only so one
  can be matched to the other. The username stays off the traveling source because an email address is the most
  identifying thing a reader has, and it would be written into a plaintext vault file by a switch they turned on to
  move their dashboards. It is also the *less* useful half to carry — an identity another device cannot authenticate
  with. Kept beside the password so one delete clears both.

So a source arrives on another device **usable and unauthenticated**, which is the honest state: that device has not
been told the password. The folder downloads land in travels with the other destinations.

### Where things are written

**A folder is a fact about the vault.** If title notes go in `Library/Titles`, that is true from every device — and
setting it once per device is the plugin asking the same question three times and keeping three answers that must not
disagree. Named exactly, because "the folder settings" is how one gets missed:

| Setting | What it is |
|---|---|
| `libraryRecordsFolder` | where title notes are written |
| `libraryCoversFolder`, `libraryExtractCovers` | where covers go, and whether they are extracted |
| `libraryEnabled`, `librarySetupDone` | whether the library writes at all, and whether it has asked |
| `recordsFolder` | the shared reading-records folder |
| `recordsSameFolderAsBook` | records beside the book instead |
| `recordsAllBooksBaseFolder` | where the across-books base is written |
| `recordsMode`, `recordsSetupDone` | whether records are written, and whether it has asked |
| `epubFolder` | where a note-to-EPUB conversion lands |
| `markdownSameFolderAsBook`, `bookExport.defaultExportFolder` | where a book-to-Markdown export lands |
| `bookSourcesFolder` | where downloaded books land |
| `syncFolder` | where sync's own published copies are written — see [Files](#files) for why this can travel |
| each note style's `notePath` / `useSameFolder` | already traveling, inside the style |

**The "already asked" flags travel with the folders**, which is the point of including them: a second device that
inherits a destination must not then ask where that destination should be — three devices, three answers to one
question about one vault.

**Consent does not travel.** Book sources' switch is the one exception in this group, because it is not "where does
this go" but "may this device contact a server".

### Styles travel

**Display styles** and **note export styles** travel. They are things you build once and want everywhere, which is
the same argument that makes a dashboard travel.

### An item travels; its place in a list does not

**A dashboard is the same dashboard everywhere. The order you keep your dashboards in is not.** A desktop with room
for six wants them arranged one way; a phone that opens two of them wants those two first. Same objects, different
arrangement, and neither device is wrong.

So an item can be **split across both homes**: its definition in `data.json`, where it travels, and its placement in
the device store, where it does not. The rule:

> Content travels. Arrangement, selection and visibility stay.

So an ordered list does not take its order from the array in `data.json`. Instead the device stores the order as a
**list of ids** — `["dash-a1b2", "dash-9f0e", …]` — and rendering walks it: ids it does not recognize are skipped,
and items not in it are appended in whatever order they arrive. A dashboard made on the Mac therefore turns up at the
end on the phone rather than not at all, and moving it there changes nothing on the Mac.

| Thing | Travels in `data.json` | Stays in the device store |
|---|---|---|
| Dashboards | the dashboards themselves | their order, and which one is open |
| Collections | the collections themselves | their order |
| Look-up sections and destinations | which exist, and their settings | — (their order is part of the popup's shape, and the popup is the same everywhere) |
| Display styles | the styles | which one is active, and the device-default style |
| Note export styles | the styles | — |
| The glossary | the entries | — |
| Progress readouts | — | which are shown, and their order |
| Toolbar buttons | — | which are shown |

**Where the line falls is a judgment each time, not a formula.** Look-up sections are ordered too, and their order
does *not* go to the device store — the popup is one small stack of sections and there is no reason for it to differ
by device, where a dashboard list genuinely does. When a case is arguable, the tiebreak is whether a reader would be
annoyed to set it twice (then it travels) or annoyed to have it set for them (then it stays).

### "Device-local" means this device AND this vault

Obsidian's `app.loadLocalStorage` / `app.saveLocalStorage` read and write `localStorage` under a key prefixed with
the vault's `appId`:

```js
loadLocalStorage = function (key) { localStorage.getItem(this.appId + '-' + key) }
```

So they are scoped to **one vault on one device**, which is the unit that actually makes sense: a phone's voice choice
for a test vault has nothing to do with its voice choice for the real one. "Per device" is the imprecise version of
this, and the imprecision produces bugs.

**Raw `window.localStorage` is not scoped**: anything kept there leaks between every vault on the machine, so changing
the Kokoro server URL in one vault would change it in all of them.

**The rule for anything device-local**: `app.saveLocalStorage`, never `window.localStorage`.

### Annotation presets travel; reading locations stay

**Annotation presets travel.** A library of marks is something a reader builds once and wants everywhere — the same
argument that makes a dashboard travel.

**The per-book copy stays.** Its justifications do not depend on sync, and one of them — a book shared from another
vault — is a case sync can never reach. There is no adopt prompt and no imported-active setting. The merge, the
survivor rule, the remap dialog and per-mark tracking are unchanged by sync, and the merge is simpler in practice,
since converged templates only ever move it forward.

The whole of it is in [annotation-presets.md](annotation-presets.md), §"Presets travel", including two things worth
knowing here. Deleting a preset a book still uses **brings it back, inactive**, because auto-import stays — it
converges rather than looping, and stranding a book is the worse failure. And the built-in preset **publishes**,
unlike the seeded note style it resembles, because `isDefault` is on the preset and which preset is the default is
exactly what another device does not know.

**Reading-location sharing stays where it is** — per book, in the progress folder, named by device. It already has
the one-writer-per-file shape, and moving it under `!orbis-data/sync/` would gain nothing.

---

## Files

```
orbis-sync.<type>.<itemId>.<deviceId>.json
```

**The name is the identity; the folder is a preference.** Every fact the merge needs is in the name, so a copy is
found wherever it is — and that is not tidiness, it is the only order that works. The folder is a setting, and a
setting arrives by the very mechanism that has to find these files first: a device that has never been configured
cannot be told where to look. It looks for the name.

So the folder can be set to anything, and it **travels** with the other destinations. Default `!orbis-data/sync`,
which is where the plugin's own vault-side data already lives (the recordings are under it), and the `!` sorts it out
of the way in the explorer.

**Not excluded from Obsidian's search.** Obsidian indexes Markdown for search, so these files are never findable; the
folder is a setting, so an exclusion would name a path the plugin does not own; and `.json` does not appear in the
file explorer either.

Examples:

```
!orbis-data/sync/orbis-sync.dashboards.dashboard-a1b2c3.macbook-7f3a91.json
Orbis/Sync/orbis-sync.collections.coll-9x8y7z.pixel-2c4e08.json
anywhere/at/all/orbis-sync.note-styles.style-default.ipadmini-55b10d.json
```

**Three consequences worth saying out loud.** A reader who moves these files loses nothing. A device that publishes
into a folder the others have not heard of is still read by all of them. And changing the folder moves each device's
own copies on its next scan — not on its next *edit*: an item that is up to date gives the merge nothing to say about
it, and would sit in the old folder. **"Up to date" and "in the right place" are different questions**, so the scan
asks both: `misplaced` reports copies of ours that are not where the setting says, and publishing one is what moves
it.

### Two states that look like faults and are not

**A deleted folder comes back, with everything in it.** The published copies are derived; `data.json` is the truth.
Delete the folder and Obsidian's own `delete` events reach the watcher, a scan runs, every item this device holds has
no published copy, and all of them are written again — recreating the folder on the first write. Every other device
notices its own copies are gone on its next scan and republishes too. There is **no prompt**, deliberately: the files
are not a second source of truth, so nothing is missing that a reader has to be asked about.

Two honest edges. A reader who deletes the folder *meaning* to stop syncing will watch it reappear — the switch is
what stops it. And an item that exists **only** as a published file, authored by a device since wiped and never
adopted anywhere, dies with the folder; everything any live device has adopted survives, because adopted records are
republished verbatim.

**Changing the folder on one device leaves two folders, and both work.** Device 1 set to B moves its own copies there
on its next scan — `misplaced` reports them, publishing moves them — and sends what it left in A to the trash. Device
2, still set to A, keeps writing its own copies into A and reads device 1's perfectly well, because discovery is by
name across the whole vault. Each device only ever moves its own files, so the two cannot fight over where a file
lives. **The trash, not a deletion**, as the reader's Deleted files setting says: a stray is found by name anywhere,
so it can be a copy kept on purpose, a backup of the sync folder inside the vault. One Obsidian has not indexed yet is
left for a later scan.

**The second device follows.** `syncFolder` travels with the other destinations in the `settings` item, so changing
it on one device carries to the rest, and each moves its own copies on its next scan. Two folders last only as long
as it takes the setting to arrive. The setup dialog on a new device defaults to wherever the vault already publishes,
which covers the moment before that device has adopted anything — and so does turning publishing on later from the
Devices page, for a device with no folder of its own (`folderToJoin`). A folder the device already holds is kept: old
copies left behind by a change would otherwise outvote the reader's choice.

**The prefix is load-bearing.** Discovery reads every file whose name parses, and a vault is full of other people's
`.json` — the reading-location files (`<book>.location.<deviceId>.json`) among them. `orbis-sync.` is what makes "is
this mine?" a question about the name rather than about the folder it happened to be in.

**One file per item**, not one per type, because the merge unit is the item. A file per type would mean adding a
dashboard on one device and another on a second loses one of them: the newer file wins whole, and the loser's
dashboard is not in it. Per item, the two are independent and both survive.

**The cost is file count**: items × devices. Thirty dashboards on three devices is ninety files, each a few hundred
bytes. That is the price of the granularity, and it is worth paying — but it is a reason to keep the whitelist to
things a reader creates deliberately, and never to publish anything generated per book.

### Granularity follows the count, not the type

An item is the merge unit, and the right unit is the largest thing that is edited as a whole. For dashboards,
collections and styles that is one file each: there are a few of them, they are big, and two devices editing two
different dashboards must not collide.

The glossary is one item per entry, whatever the file count — see [Sync owns the glossary](#sync-owns-the-glossary).

The settings-shaped items are the other way: the destinations and their "already asked" flags are one item,
`settings`, not one file per key. They are small, they are edited together, and nobody edits two of them on two
devices in the same minute.

### A device should be able to name another device

Records carry the author's device *id*, the file names carry ids, and the merge matches on ids — which is right, since
a name is a label a reader can change and an identity must not be. But ids alone leave nothing able to say
*"Dashboards updated from the Mac"*: the only other id-to-name mapping in the vault is inside the reading-location
files, which are a different feature's data and which sync does not read.

So: a `devices` item, one record per device, holding its name and when it was last seen. One more type through the
same machinery, published and merged like any other, and the device is both the item id and the author — the only
type where an item is *about* the device that writes it, which is what makes it single-writer by construction.

What it buys:

- Anything that reports another device's data can name it instead of printing a hex string — the resume prompt, and
  the debug log's `sync` lines.
- The name asked for at setup earns its place in that dialog, rather than being borrowed from reading-location
  sharing.
- A reader can see which devices are participating, and when each last published, without opening a folder.

In `sync/devices.ts`, one detail decides whether it costs anything: **`lastSeen` is a DATE, not a timestamp.** A
timestamp changes on every scan, so the record's hash would change on every scan, so every device would publish a
file on every scan and the folder would never go quiet — the steady state the whole design is built around. A day is
as precise as "which devices are still in use" needs, and it means at most one write per device per day.

A device writes only its own entry; another device's record is that device's to write, and rewriting it here would be
two devices claiming one item. The roster is ordered by id so that two devices publish the same list from the same
facts. `nameOf` falls back to the id for a device nobody has named, because "Unknown device" would be worse than the
string a reader can match against the Devices page.

### Sync owns the glossary

Sync is how the glossary travels. There is no vault-file glossary, and no prompt to adopt one found there or to
settle a clash: a second mechanism for the same job is what this design exists to avoid.

Hand-editing a glossary in bulk is therefore not offered. If that turns out to matter, the answer is an export and an
import — a one-way copy, not a second source of truth.

**One item per entry, not one item holding the lot**, because of what an entry is. A respelling is added one at a
time, when a book mispronounces a name, on whichever device is reading. Two devices adding different words between
syncs is the ordinary case rather than a rarity: per entry, both survive; packaged as one item, the newer copy of the
whole glossary wins and the other device's word goes with it. The file count — entries × devices — is the price, and
it buys the merge that matters here.

**An entry needs an id, and the word cannot be it.** A word is a thing a reader retypes: correcting "Stuart" to
"Stewart" would otherwise be a delete and a create rather than an edit. It also cannot be a file name — a word may
legitimately contain a slash, and every published copy is a file. So entries carry `Pronunciation.id`, minted once at
load for any entry without one.

**And one rule the other types do not need: a word may appear once.** Add the same word on an offline phone and on
the Mac, and the two entries are different items — each minted its own id — so the merge keeps both, correctly,
because nothing about them says they are the same thing. The word does. Two entries for one word is not a duplicate
to tidy at leisure: `compilePronouncer` resolves it by array order, and array order is a fact about how each device's
merge happened to append things, so the same word could be spoken differently on each device with nothing on screen
to explain why. After any merge, the later entry for a word stays and the rest are tombstoned — decided by version,
which is the same fact everywhere, so both devices reach the same answer independently. See `sync/glossary.ts`.

### The record

```json
{
  "id": "dash-a1b2c3",
  "type": "dashboard",
  "device": "macbook-7f3a91",
  "version": { "clock": 412, "at": "2026-08-24T14:03:11.220Z" },
  "deleted": false,
  "item": { }
}
```

- **`id`** — the item's own id, which is what the merge is keyed by. Never the file name.
- **`device`** — the device that **authored** this version. *Not* the one that published this copy: that is the file
  name's job, and conflating the two breaks the merge (see
  [Three rules a version depends on](#three-rules-a-version-depends-on)).
- **`version.at`** — UTC, ISO 8601, and **compared first**. Logical time, not simply what the authoring device's
  clock said: the latest time that device had seen anywhere, its own or on a record it had read.
- **`version.clock`** — the tiebreak within one `at`, not a per-device edit count.
- **`deleted`** — the tombstone. A deleted item keeps its record and loses its payload.
- **`item`** — the payload, exactly as `data.json` holds it.

**Why a counter as well as a clock: a hybrid logical clock.** Two demands pull against each other, and a timestamp
here has to satisfy both.

- **Causality.** An edit made on top of a version this device just read must sort after it. Otherwise a device whose
  clock runs slow loses to the very thing it was editing, and the reader's change vanishes with nothing reported.
- **Recency.** Of two edits made independently, the later one should win — which is what a reader expects, and what
  they will test.

A wall clock alone gives the second and loses the first. A Lamport counter alone gives the first and loses the
second: compared first, it lets the device that has edited most win every concurrent conflict regardless of when the
edits happened, so an offline phone's older rename would beat the Mac's later one.

So `at` is a **hybrid** logical clock: a physical time that is dragged forward by anything the device has seen and
never moves backwards. Two rules maintain it (`sync/clock.ts`):

```
making a change:   l' = max(l, now)          c' = (l' == l) ? c + 1 : 0
reading a version: l' = max(l, incoming, now) c' = the winner's counter + 1, or 0 if `now` won
```

If real time has moved on, take real time and reset the counter. If it has not — two edits inside one millisecond, or
a device carrying a time it read from someone ahead of it — keep `l` and bump the counter, which is the carry digit
that keeps ordering strict while the wall clock catches up. So a phone ten minutes slow that adopts a version stamped
10:00 stamps its own next edit `10:00 #1`, and wins, as it should.

**Everything read moves the clock, not only what is adopted.** A version this device declines to take is still a
version it has seen, and its reply has to sort after it or the other device will not take the reply.

**The cost, stated plainly:** `l` only moves forward, so one device with a badly fast clock drags every device's
logical time to wherever it claimed, after which the counter does all the ordering until real time catches up — the
scheme degenerates to a Lamport clock, which is a slowdown rather than a corruption. The standard mitigation is to
refuse a timestamp more than a few minutes ahead of local time and say so in the log. Orbis does not: with a handful
of devices taking their time from the network it does not arise, and a guess at the tolerance is worse than no guess.

**Never file mtimes.** Sync tools rewrite them. Only what is inside the file counts.

### Where a version comes from

**Nothing tells the plugin that an item changed.** A dashboard is edited from the settings page, the widget editor, a
drag, a rename that saves on each keystroke — and a version bump at each of those is a list that would be wrong
within a week, and wrong quietly. What is missed does not look like a bug: the item is right on this device and stale
on every other one, which is the failure this design is least able to notice.

So the version is derived. `data.json` keeps, per type and per id, `{ clock, at, device, deleted?, hash }`, where
`hash` is the payload as it stood when that version was stamped. Before a scan compares anything:

- an item with no version is new to sync — just built, or here since before the switch went on;
- an item whose hash has moved was edited **here**, and gets a fresh counter;
- a version whose item is gone was deleted here, and becomes a tombstone.

Deletes therefore need no instrumentation either, which is the same argument arriving at the same place. The hash is
FNV-1a over canonical JSON — key order does not count, array order does — and it is never compared *between* devices:
a hash says nothing about which of two copies is newer. It answers one question on one device, which is *has this
changed since I last gave it a version?*

**The adopted record keeps its hash recomputed from the adopted payload**, so the very next pass does not read an
adoption as a local edit. That is the whole reason for hashing rather than instrumenting, stated as the thing it must
not do: an adoption is a change to `data.json` that must not look like one.

### Three rules a version depends on

Each is a design rule rather than a detail: break one and the devices never settle.

**A record is published verbatim, and its `device` never changes.** The device is part of a version's identity. A
copy stamped with the adopting device's name is a version the other device does not recognize, so it adopts it back,
and the two write to the vault forever. Nothing about a version changes when it is copied.

**Adopting lifts our clock** — `liftClock(local, adopted) = max(…)`. A device that has never edited sits at 0; without
the lift, adopt a version at clock 4, edit it, and that edit is clock 1 — behind the very thing it was made on top of,
so it loses and the reader's change vanishes.

**"Have I published this?" is a question about the file, not the record.** Since `device` means author, our own file
can contain someone else's authorship, so the answer comes from the path (`<item>.<thisDevice>.json`). Asking the
contents instead would make every settled scan write again — quiet convergence would become a permanent trickle of
writes.

**And the device id is the final tiebreak** when the clock and the counter agree. Without it two devices editing in
the same millisecond each prefer their own copy forever; with it they pick the same winner independently. Which one
wins does not matter, only that they agree.

---

## The merge

```
for each type in the whitelist:
  for each item id seen in data.json or in any file:
     mine   = the record in data.json (or absent)
     theirs = the newest record among the other devices' files
     if theirs is newer than mine:
        adopt theirs into data.json, tombstone included
        publish our own file with THEIR version, unchanged
     else if our file is missing or stale:
        publish our own file with our version
```

**"Newer" is `(at, clock)`**, compared in that order, with the device id as the final tiebreak. Equal versions are
the same version: nothing is written, which is what makes a steady state quiet.

**Adopting a tombstone removes the item from `data.json`** and republishes our tombstone. The item is gone everywhere,
and stays gone — which is the whole reason for tombstones. Without them, the device that still has the item
reinstates it on the next scan.

**Tombstones are kept, not swept.** A tombstone that is deleted is an item that comes back. If the file count ever
becomes a problem, they can be dropped after a long interval — months, not days — and that is a decision to take with
evidence rather than up front.

### When it runs

- **At load**, once, after the vault is ready.
- **On a vault `modify`/`create`/`delete` of a file whose NAME is one of ours**, wherever it is, which is how a sync
  tool's incoming write announces itself. Debounced: a sync run lands many files at once. Not before the workspace is
  ready: while the vault loads, Obsidian reports every file already in it as created, and on Android that is still
  going on when Orbis starts. Taken for arrivals, those reports would run a full scan while a book reopened at launch
  waits for its own files. The scan at load covers what came in while Obsidian was closed.
- **On window focus**, for the case where the device slept through the sync.

Not on a timer. On a phone that is battery spent on nothing.

---

## Turning it on

**Optional, and off.** A reader with one device should never meet this feature: not a folder in their vault, not a
prompt, not a setting they have to answer before something else works. Orbis reads books; a reader who keeps their
vault on one machine has no problem to solve here, and the plugin must not invent one for them.

**With the switch off**, `data.json` is simply the truth: nothing is published, nothing is scanned, no sync folder is
created, and every screen behaves exactly as it would if the feature did not exist. That is not a degraded mode —
it is what a single-device install is.

**Orbis does not sync. It makes its configuration syncable.** That distinction is the first thing the reader is told,
on the signpost row and again in the setup dialog, because getting it wrong produces the worst kind of bug report:
"I turned it on and nothing arrived." Orbis writes files into the vault; a sync tool moves them.

**Turning it on** is the master switch, *Use this vault on more than one device*. The first time on a device, it
opens a setup dialog — the shape book sources and the records destination already use. So does the offer a book
open makes when the vault holds another device's files and this one is not taking part; both go through
`runSyncSetup`. After setup, the master switch and *Share Orbis configuration in the vault* below it are plain
switches. The dialog asks the questions this device cannot proceed without:

- **What is this device called?** Prefilled from `Platform` with the kind of machine it is ("Mac", "Android phone"),
  numbered if that name is taken ("Mac 2"). It is a suggestion, not a detection: Obsidian gives us no API for the name
  the operating system knows. **The name identifies nothing** — files carry the device ID and the merge matches on it
  — so it is asked for here only because this is where a device is set up, and a name is what the reader sees wherever
  one device names another: the resume prompt and the debug log.
- **What should this device share?** Reading location on, Orbis configuration off: sharing a position needs nothing
  set up, while publishing configuration writes a folder of files and is worth opting into.
- **Where should these files go?** Shown only with configuration ticked, and kept only then — a device that shares
  nothing has answered nothing about a folder. Defaulted to where the vault already publishes, when it does — on a
  second device this question is already answered, and asking it as though it were open invites a different answer.

**Dismissing leaves the switch off**, as it does for the other two dialogs. A switch reading "on" over a feature that
was never told where to write is the thing all three exist to prevent. Answering it runs the first scan.

**The switch and "has this been set up" are per device; the folder is not.** Where files go is a fact about the vault
and travels with the other destinations. Whether *this* device writes them is consent, and consent does not travel —
the same line book sources draw around contacting a server. So a reader who also syncs `.obsidian` does not have one
device's opt-in start publishing on every machine, and a second device is not told it has "already been asked" for a
name it has never given. See `sync/enabled.ts`.

**Turning it off** stops publishing and scanning immediately. The files already in the vault are left alone — deleting
another device's copy of a dashboard on the way out is the one thing an off switch must not do — and the reader can
remove the folder by hand if they want it gone.

**Nothing else is gated on it.** No feature refuses to work because sync is off, and no setting hides behind it. It
adds travel to things that already work; it is never a prerequisite.

**Obsidian's own plugin-data sync is the alternative, not a companion.** If Obsidian Sync is syncing `data.json`, that
file is itself a synced document with its own conflict resolution — the problem this design avoids, running
underneath it. A reader with that arrangement should leave this switch off; the two are two answers to one question.
Worth detecting and saying so rather than letting both run.

---

## Adoption is not a question

**The newest version wins, and the reader is not asked.** An approve-each-change mode is the prompt this design
exists to avoid, and it is worse than it looks: holding an unadopted change means keeping it somewhere, and that
somewhere is a second source of truth — which is exactly where sync bugs live.

**There is no undo either.** An arrival is silent — no notice, only a line in the debug log's `sync` category — so
there is nothing to hang one on, and a notice per arrival is the interruption this design exists to avoid. The
granularity is the safety net: a change replaces one item, whole, and nothing else. A reader who wants an old
version back has their own backups — see *Nothing is versioned* below.

---

## What it costs, stated plainly

- **A concurrent edit to the same item loses one side.** Two devices renaming one dashboard while both offline: the
  newer wins, whole. Per-item granularity keeps that to the item actually touched, and there is no field-level merge
  and no intention to build one — that is a CRDT, and this is a reading app.
- **Files multiply**: items × devices, as above.
- **A skewed clock can still win a cross-device race**, as it can in any last-writer-wins scheme. A device an hour
  fast wins every concurrent conflict for the next hour, and drags everyone's logical time with it.
- **Nothing is versioned**: the vault holds the current state per device, not a history. The reader's own backups are
  the history.

---

## Two ways to sync, and why the granular one is worth building

Some readers will sync `data.json` itself — Obsidian Sync can, and a file-sync tool will whether asked to or not.
**Both ways work, and the difference between them is not what travels. It is what one collision costs.**

Since `data.json` holds exactly the syncable set, the *content* is the same either way: the same dashboards, the same
collections, the same field table, the same glossary. What differs is the merge unit.

| | Syncing `data.json` | Publishing vault files |
|---|---|---|
| Merge unit | the whole file | one item |
| Two devices editing different things between syncs | one file wins **entire**; the other device's change is gone | both survive — the merge only decides where they genuinely collide |
| Two devices editing the **same** item | one wins | one wins |
| A half-delivered sync | an inconsistent file, or a conflict copy to resolve by hand | the items that arrived are merged; the rest arrive later |
| One unreadable or truncated file | the whole set is suspect | that item is skipped; the next scan finds it whole |
| A delete | "the arriving file does not have it", which only works because the whole file arrives | an explicit tombstone that can win on its own |
| Cost | none — it is one file | items × devices files, and the machinery that versions them |

**So `data.json` sync is all-or-nothing in two senses**: everything in the file travels together, and a collision is
resolved for everything in the file at once. Rename a dashboard on the Mac while adding a collection on the phone, and
one of those two is simply lost — not because anything went wrong, but because the unit of comparison was the file.

**That is the justification for the vault-file design, and it is the only one it needs.** A granular sync is not a
richer sync; it is a **less brittle** one. Every failure mode above has a blast radius of one item instead of
everything, and the machinery — versions, a clock, tombstones, one file per item per device — exists to buy exactly
that and nothing else. The price is file count and the code to maintain it, paid once, against a class of loss that
would otherwise recur every time two devices are edited between syncs.

**Neither is a fallback.** A reader with one device, or with a sync tool they trust and a habit of editing settings on
one machine, loses nothing by syncing the file. A reader who edits on three devices in a day should publish. The
plugin should be a good citizen in both, and the work that makes it one — keeping device-shaped state out of
`data.json` — is work this design needs anyway.

**Obsidian gives us the hook.** `onExternalSettingsChange()` fires when `data.json` changes underneath us; the plugin
implements it, reloads, drops the pronouncer cache and reapplies the ribbon icons.

**Per-device data inside a synced document is the flaw**, and keying it by device id only hides it. Under wholesale
sync the Mac's file lands on the phone entire: a phone's entry — its voice preference, say — is not in it, so the
phone loses its voice, writes its own back, and the two devices trade the file forever.

**Two viable models, not one and a fallback.** A reader who syncs `data.json` directly should end up with what a
reader using Orbis's own publishing ends up with. That only holds if the file contains *nothing but* the traveling
set — every device-shaped key left in it is a decision made on one screen arriving on another.

**Device-shaped settings live in device storage** (`device-settings.ts`): one JSON object in vault-scoped storage
rather than a key each, and one flat key namespace with three stores behind it — the settings resolver routes `gen.*`
to the recording config and `isDeviceSettingKey` to device storage, so the declarative rows do not have to know which
store answers. They are the toolbar's buttons (a phone with room for four icons and a desktop with room for nine do not
want the same toolbar); reading and listening behavior (the arrow keys, the flash, link preview, the reading
highlight, the delete confirmation, both skip intervals, read-ahead, the wake lock, `playbackSource`, the TTS rate);
the progress readouts; and the uncataloged notice with its dismissal, the palette's dev switch, and
`epubFetchRemoteImages`, which is consent rather than chrome.

**Moving a key out of `data.json` reads the RAW settings, not the merged object.** A merged object holds every key,
so every device would look as though it had answered, and a later change of default could never reach one. Taking the
raw file means a device that never touched a toolbar button carries nothing and follows the default. Keys that are no
longer settings (`voicePrefs`, `libraryDashboardOrder`, `libraryActiveDashboard`) have no stub; their migrations read
the raw file, which is where a setting that is no longer a setting belongs.

**And the cost, stated plainly: these are less durable than `data.json`.** The vault is backed up and synced; vault-
scoped `localStorage` is not. Clear an app's data, reinstall, or move machine, and they go back to their defaults.
That is why only cheap-to-re-set things go here. The book-source *list* travels instead, since three OPDS URLs are
laborious to re-enter and that is exactly what should not sit in storage a reinstall clears; its passwords live in
`app.secretStorage` (per device by construction), and only `bookSourcesEnabled`, being consent, is in device storage.
Annotation presets travel as a type of their own rather than a whitelisted key — they are a list of items with ids,
which is what the per-item files are for — and there is no `importedPresetsActive`: an import arrives inactive.

**There is no stale-settings prompt** asking which whole copy of the settings to keep. When `data.json` changes
underneath, whatever this device changed in the last moment is still a real edit, but the two sides are not
symmetric. Taking theirs costs nothing that belongs to this device, since nothing device-shaped is in the file; saving
over theirs silently discards however much of their file the difference covered. An asymmetry that clear does not
need a reader to arbitrate it, especially one being asked to choose between two copies neither of which is on screen.

So the difference is detected, the other device's file is taken, and a notice says a local change went with it. It
can only ever fire for a reader syncing `data.json` itself: under this design nothing else writes that file.

Whichever model a reader uses:

- **Device-local state lives outside `data.json`**, in vault-scoped local storage, leaving `data.json` as exactly the
  syncable set. Under this design that makes publishing a straight mirror; under direct sync there is nothing
  device-shaped left to clobber.
- **`data.json` is written with sorted keys**, so a text-merging sync tool sees the smallest diff it can.
- **Items keep their `version`**, which makes a backwards overwrite detectable even with no files to recover from.

What the plugin should *not* do is try to run both models at once. Two writers is the problem being removed.

---

## The types

The arithmetic is `sync/records.ts`, the hybrid logical clock `sync/clock.ts`, the file names `sync/paths.ts`, the
store `sync/store.ts`, the scan loop `sync/engine.ts`, version derivation `sync/stamp.ts` and the scheduler
`sync/manager.ts`. The switch is on the Devices page, gated on naming the device.

**Registration order is settings, then fields, then collections, then dashboards.** A folder is adopted before the
type that writes into it; a collection's rules are read through the field table and a widget names a collection, so
adopting them the other way round would paint widgets pointing at collections this device has not read yet.

**Dashboards** travel; their order and which one is open are in device storage (`library/dashboard-place.ts`).

**Collections and the field table.** Collections are one item each; the field table is **one item** under a constant
id, since it is edited and read as a whole. `destinationFolder`, which two other features ask, is in
`library/destination.ts`.

**The glossary.** One item per entry, with the uniqueness rule above.

**Display styles and note export styles.** A device seeds a "Default" note style before it has ever seen the vault,
so devices set up before sync each have their own, each a different item. And a device installed *today* seeds one
whose version is newer than the default a reader has been refining for months — publishing it would overwrite theirs
everywhere with the shipped article, a placeholder beating the thing it stands in for.

So a seeded default nobody has touched is treated as scaffolding: it carries a fixed id so two devices seeding one
produce one item rather than two, it is **not published**, and it is **removed once real styles arrive** — but kept
when nothing else exists, since a vault with no styles still needs one to generate notes with. Edit it and it stops
being scaffolding. See `sync/styles.ts`.

**A rule of a type's own runs on every scan, not only after adopting.** Both of these — one entry per word, one style
holding the default — could be applied only where the merge takes something in, which is where the breach is created.
That would miss a state already sitting in `data.json` from an earlier merge: a device with nothing left to adopt
never looks at it, and the fault stays on screen through any number of scans. They run before the comparison, and the
stamping notices the change, which is what makes the fix travel.

**And one role, not two.** `isDefault` marks the note style notes are generated with — one per vault. Each device
keeps its own list to one, so each list is fine alone; merge two and you have two claimants, which is not untidiness.
`find((s) => s.isDefault)` then answers by array order, and two devices can order their merges differently, so they
would silently disagree about which style is used. After a merge the flag stays on the claimant with the later
version — the same rule the glossary's uniqueness uses, for the same reason: a version is the same fact everywhere,
so every device clears the same flags without talking.

This device's own display style is not among the published ones: it lives beside the device (`device-style.ts`),
because a style is about a screen. Which style is *active* stays per device too.

**An adopted style has to be applied, not merely stored** — the one thing a display style needs that no other synced
type does. A style is a saved copy of the live display settings, and those live beside the device. Adopt a change and
only store it, and three things go wrong at once: the reading view keeps the old values, the settings page shows the
live values rather than the style's, and the next touch of any display control writes the stale live values straight
back into the style, overwriting what the other device sent. So when a scan adopts the style this device is USING,
the values are applied and the views refresh; adopting a style the reader is not using leaves their screen alone.

**The `settings` item.** The destinations and the flags that say a destination has already been asked about, as one
record merged whole. The list is **named, never derived** (`sync/shared-settings.ts`): a rule like "every key ending
in Folder" would quietly enroll the next setting somebody adds, and the failure would be a device changing a
preference it was never asked about. Adopting answers *which* keys moved, because several reach outside `data.json` —
the Library's ribbon icon follows `libraryEnabled`, and an open reader has to be told when a destination moves.

It also carries `recordKinds`, the two audio capture granularities and `frontmatterKeyLanguage`, because they decide
what lands in the *vault* rather than how a device behaves — the last is a correctness matter, since two devices
disagreeing write two spellings of the same field into one vault.

Three kinds of setting are deliberately left out, and the omissions are as much of the design as the list:
**consent** never travels (`bookSourcesEnabled`, `epubFetchRemoteImages` — decisions about a device on a network,
where the download *folder* is a fact about the vault), **dismissals** stay (`libraryUncatalogedDismissed` is "I have
seen this and waved it away"), and **reading behavior** stays — page-turn keys, flash navigation, link preview, skip
seconds, read-ahead, the wake lock, playback source and the TTS rate all describe how a device feels to read on, as
does every toolbar and player button, every progress readout, and the debug switches. The apply is a whitelist in both
directions: these payloads are files in a vault, and a hand-edited one must not reach a key nobody agreed travels.

**Devices.** One record per device: its id, its name, and the day it was last here. The scan log names the device a
change came from instead of printing its id, and the dev status command lists the roster.

**Annotation presets.** A synced type; see
[Annotation presets travel; reading locations stay](#annotation-presets-travel-reading-locations-stay).

**The whitelist is closed**: every settings key is either on it or deliberately kept on the device.

---

## Open questions

- **How loudly a scan says what it changed.** Latest wins, always — see *Adoption is not a question*. What remains
  open is only the volume: silent, a notice, or a line in settings.
