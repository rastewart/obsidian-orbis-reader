# Book annotation sync

← [Design Docs](README.md) · [Multi-device sync](multi-device-sync.md)

**Status: built.** How a book's marks, notes, bookmarks, reading-speed samples, generated notes sets and
reading-records decision survive being changed on two devices while they cannot reach each other.

---

## The problem

A book's marks, notes and bookmarks, and its copy of a preset, live in one file — the book's `.orbis` — and every
device writes it. Two ways that loses changes:

1. **The book is open on two devices**, and the second saves over what the first just delivered. **Solved**: an open
   book watches its `.orbis` and reloads when another device's version arrives (`orbis-file-watch.ts`), telling that
   version from the echo of its own save by content (`isOwnOrbisWrite`).
2. **Both devices change the book before either syncs** — the phone off the home network and the Mac still on it.
   A sync tool keeps one copy of a file, so one device's changes are gone when the phone reconnects. **This is what
   the design is for.**

Case 2 cannot be fixed inside one file that two devices write. It is fixed by never having two devices write the
file whose contents matter.

---

## The shape

**Each device writes only its own changes, to a file of its own; the `.orbis` is rebuilt from all of them.**

```
Books/!orbis-data/
  Sample Book.epub.orbis                  ← rebuilt; everything else reads this, as it does today
  Sample Book.epub.marks.<deviceId>.json  ← one per device that has changed this book's marks
  Sample Book.epub.location.<deviceId>.json   (as now)
```

- **Every other feature keeps reading `.orbis`.** The Library, every export, the marks PDF, the data view, search and
  the clipboard commands are untouched. The device files are an input to one function, not a second format for
  twenty readers.
- **A device file is written by one device only**, so the sync tool never has two versions of it to choose between.
  Take the phone offline, mark three passages, mark one on the Mac, reconnect: both files arrive everywhere, and every
  device rebuilds the same `.orbis` holding all four.
- **The `.orbis` becomes derived.** Two devices can still overwrite each other's copy of it, and it no longer matters:
  nothing is lost that the next rebuild does not put back.
- **The naming follows the location files**, `<book stem>.marks.<deviceId>.json`, and the sidecar suffix list
  (`SIDECAR_SUFFIX` in `sidecar-names.ts`) includes it, so renaming, moving and deleting a book carry the device
  files with it — `moveOrbisSidecars` and the delete path both go by that list. The data README
  (`book-data-file.ts`) has a row for them.

---

## What a device file holds

One **record** per item this device has changed — not a copy of the book, only its own contributions — in the
record shape the sync engine already uses (`src/sync/records.ts`):

| Field | |
|---|---|
| `id` | The item's id: a highlight's, note's, bookmark's or notes set's; `preset` for the book's preset; `readingStats` for this device's samples; `records` for the reading-records decision |
| `kind` | `highlight`, `note`, `bookmark`, `preset`, `readingStats`, `notesSet` or `records` |
| `version` | A hybrid-logical-clock version from `src/sync/clock.ts` |
| `device` | Who made it — the tiebreak `compareVersions` already uses |
| `deleted` | `true` for a deletion; `data` is then absent |
| `data` | The item as `.orbis` stores it today |

**The clock is the engine's, unchanged.** It gives the two properties this needs: an edit made after seeing another
device's version always sorts after it, whatever the two devices' clocks say; and of two edits made independently,
the later one wins. That second property was found on real devices renaming one dashboard — see the header of
`clock.ts` — and it applies to a note edited on two devices just the same.

**The items need no `updatedAt` of their own.** The version lives in the record beside the item, so `Highlight`,
`Note` and `Bookmark` keep their shapes and `.orbis` does not change format.

---

## The rebuild

Inputs: the current `.orbis` and every device file for the book. For each item id, the record with the newest
version wins (`compareVersions`); a winning deletion removes the item. An item in `.orbis` with no record anywhere is
kept as it is. Output: `highlights`, `notes`, `bookmarks`, `preset`, `readingStats`, `notesFiles` and `records` in
`.orbis`, and nothing else touched.

**Reading-speed samples are added up, not decided.** A sample is a number with no time on it, and each device owns
only the ones it recorded, so there is nothing to conflict: the book's `wpmSamples` are every device's samples, the
devices taken in the order they last recorded (their records' versions), trimmed to the newest 15 as today. A device
file carries only that device's own samples, never the combined list it read, so no sample is counted twice.

Three rules make overwriting `.orbis` harmless:

1. **Deterministic.** The same inputs give the same file, byte for byte: items in a fixed order (the order the reader
   sees, then id), no timestamp of the rebuild itself. Two devices that have seen the same changes write identical
   files, and the sync tool has nothing to disagree about.
2. **Written only when it differs**, so a rebuild that changes nothing costs no sync traffic and no battery.
3. **An arriving `.orbis` is a reason to check, not the truth.** A device that receives one rebuilds from the device
   files it holds, and writes its own if the result differs. Devices can disagree for as long as a change is still
   travelling; once every device holds every device file, they all produce the same `.orbis` and it stops moving.

**Writes to one `.orbis` take turns** (`serialOrbisWrite`). Every write reads the file, changes it and writes the
whole file back, so two that overlap on one device both read the same version, and the second writes it back without
the first one's change. A reading-speed save landing just after Generate notes recorded its set did exactly that, and
Open notes lost the set. Device files cannot help here: a device's own file is read and written back the same way.

**No migration.** Today's `.orbis` is the starting point: its items have no records, so they stand until a device
changes them. Nothing is converted, and a vault on the old version and one on the new read the same `.orbis`.

**A stale `.orbis` cannot undo anything.** One written by a device that had not yet seen a deletion still holds the
deleted item — and the deletion record removes it again. One missing an item another device added has it put back
from that device's file.

---

## What counts as a change

Every path that saves annotations today records a version for what it changed:

- a highlight added, recolored, re-marked or removed;
- a note added, edited, re-marked or deleted;
- a bookmark added or removed;
- the book's preset changed in any way — see the next section;
- annotations **remapped** by a preset change, a mark deletion ("apply another mark") or Copy to this book: each
  annotation whose `markId` changed gets a new version, since that is an edit to it.

These all go through a handful of functions in `progress.ts` today (`saveHighlights`, `saveNotes`, `saveBookmarks`,
`saveBookPreset`, `saveBookPresetAndAnnotations`). Recording the change there — by comparing what is being written
with what the device last wrote — keeps the callers unchanged.

**Notes sets and the reading-records decision are recorded as what was done**, not found by comparing lists
(`recordNotesFileSet`, `saveBookRecords`). Generate notes knows the one set it wrote; a list it read could lack another
device's newest set, and comparing would record that set's deletion. A new set **replaces any set recorded at the
same file or folder**, which it overwrote (`notesSetChanges`). The reading-records decision is one value, like the
preset, and un-deciding it is a deletion.

**Open notes hides a set whose files are missing; it never deletes it.** The files may only not have arrived yet,
and a deletion recorded then would travel to the device that wrote them and remove the set there.

---

## The book's preset

A book's preset copy (`preset` in `.orbis`: which preset it follows, its marks, what is inactive here, the two
roles, whether it has stopped following a preset) is **one item**, and the newest version wins whole.

**Not one record per mark**, because the operations that change it change several things together. Switching
preset, stopping one, copying a mark into the book and deleting a mark each rewrite marks AND the `markId` of the
annotations using them. Merging half of a switch with half of another would leave annotations pointing into two
presets at once. As one item, the later preset change wins, and the annotations it remapped win with it, since they
were versioned in the same change.

**A mark in the global preset library** is a different thing and already travels: presets are a synced type of
[multi-device sync](multi-device-sync.md#annotation-presets-travel-reading-locations-stay), each device writing its
own copy. Each device then merges the new revision into the books that follow it (`mergeBookPreset`), and the two
devices' merges produce the same preset — so the two records agree, and either winning is the same result.

### No annotation loses its mark

The one case the whole-item rule does not settle by itself: the phone, offline, switches the book to another preset
while the Mac adds a highlight with a mark from the old one. The phone's switch wins the preset; the Mac's highlight
survives as an item — and its `markId` names a mark the winning preset does not have.

**So the rebuild ends with the survivor rule** the merge already applies (`mergeBookPreset`, "dropped upstream"): any
annotation whose mark the winning preset lacks keeps it, as a mark of the book's own, taken from the preset version
that had it. That version is in the losing device's file, so it is always to hand. The invariant is the one the preset
design already states — **no annotation is ever left without a mark** — carried across devices.

**One case is left as it is.** If the mark kept this way looks the same as a mark in the winning preset, and both have
annotations, the book ends up with two marks of one look: dropping either would take the mark off someone's
annotations. It needs a preset switch on one device and, at the same time, a mark on the other whose look the new
preset reuses. The Marks dialog shows both, and changing one's look resolves it.

---

## Clearing a book

**Deleting a book's `.orbis` clears the book**, as it did before device files — by hand, or by the sync tool passing
on another device's deletion. Without this the marks would all come back at the next save, rebuilt from the device
files that still hold them.

`clearBook` records the moment of the clear in this device's file (`clearRecord`), and from then on only what was
recorded since counts — marks, notes, bookmarks, the book's preset, the reading-speed samples, the notes sets and the
reading-records decision alike, from every device, and anything a stale `.orbis` still holds from before. A mark made after the clear stays.

**A cut-off, not a list of deletions.** A device that was offline when the book was cleared can hold marks the
clearing device never saw — made while it was away. A deletion per known item would leave those standing, and they
reappeared on reconnecting when this was first built; a cut-off drops them with everything else from before the
clear, which is what deleting `.orbis` has always meant: start this book over. The other devices' files are left
alone, because deleting a file another device is writing to at that moment could lose a mark it has just made.

**The cut-off is compared by the devices' clocks**, as every version is: a device whose clock runs fast can have a mark
made just before the clear count as made after it. A device's own running list of samples starts over after a clear
made anywhere (`ownSamples`), or its next save would put the old samples back. The cleared book has no preset, so an
open one gets the default, as a book opened for the first time does.

**Deleting or renaming the book is not a clear.** It takes the `.orbis` with it, and the handler does nothing for a
`.orbis` whose book is no longer at its path.

---

## Live updates

A plugin-level watcher — the sync engine already has one (`src/sync/manager.ts`, `create` / `modify` / `delete`) —
rebuilds a book's `.orbis` when one of its device files arrives, whether or not the book is open, so the Library and
the exports see another device's marks without the book being opened first.

**What arrived while Obsidian was closed is caught up once, when the workspace is ready.** Every book with a `.orbis`
or another device's file for marks is rebuilt, one at a time, and the debug log's `annot` pill says how many books
and how long (`catch-up at launch`). Until then the watcher ignores the vault's reports: while the vault loads,
Obsidian reports every file already in it as created, on Android while Orbis is starting but not on the iPad. Taken
for arrivals, they would read every `.orbis` and rebuild every book at once, while a book reopened at launch waits
behind them for its own files; and a device that gets no such reports would never catch up (`watchBookFiles`,
`src/reader/orbis-file-watch.ts`).

**Reading-record notes stay with the device that made the change.** The device that marks, changes or deletes
something writes its record note, and the others receive the note by sync, as they receive the marks — so a reload
after another device's changes does not write record notes. Writing them there too would have two devices write the
same generated notes at about the same time, which is what a sync tool reports as a conflict. The one case left is
the one a separate file cannot help: two devices changing the same annotation while apart both rewrite its note, and
the sync tool keeps one. It heals itself: the next change to the book, or its next open, on any device, runs the export
pass, which compares every note with the merged marks and rewrites only those that differ (`updateRecord`).

**The open book is told directly.** Its own watcher ignores content this device wrote, and a rebuild is written by
this device — so the rebuild notifies the open view itself, which then reloads exactly as it does today.

---

## What stays shared in `.orbis`, and why

| Key | Decision | |
|---|---|---|
| `highlights`, `notes`, `bookmarks`, `preset` | **Device files** | This design |
| `notesFiles` | **Device files** | The notes Generate notes wrote, which Open notes offers — see [What counts as a change](#what-counts-as-a-change) |
| `records` | **Device files** | The book's reading-records decision: one value, like the preset |
| `title`, `author`, `coverImage`, `toc` | Shared, as now | Read from the book, so every device writes the same thing |
| `readingStats` | **Device files** | Reading-speed samples, added up across devices — see [The rebuild](#the-rebuild) |

---

## Decisions

1. **Reading stats go in device files**, added up across devices rather than decided — see
   [The rebuild](#the-rebuild).
2. **Device files are always written**, whether or not **Use this vault on more than one device** is on. It is one
   small file per book on a single device, and it means a device that turns sharing on later already has a record
   of everything it changed.
3. **Deletion records are kept forever.** They are small and a book collects few; pruning them would need every
   device known to the vault to have seen each one, which is machinery for a cost that has not appeared.
4. **A note edited on two devices while apart: the newest edit wins whole**, and the other edit to its text is lost.
   A text merge is a different class of feature, and newest-wins matches everything else here.

---

## Risks and costs

- **Two writes per change** — the device file and the rebuilt `.orbis` — and two files to sync. Both small.
- **One more file per device per annotated book**, beside the location files that already exist.
- **The rebuild must be deterministic**, or two devices would keep rewriting `.orbis` over each other. It is a pure
  function and gets tested as one: the same inputs in any order give the same bytes.
- **Mobile file events.** A relies on Obsidian reporting a sync tool's writes on every platform, and that held on Mac,
  Android, iPhone and iPad with Self-hosted LiveSync. Another sync tool that writes behind Obsidian's back would need
  the book reopened to notice — true of A today.

---

## Testing

**The rebuild is a pure function** — `.orbis` plus device files in, `.orbis` out — so every scenario is a unit test
before it is a device test:

- the offline case: marks on the phone and the Mac while apart, both kept after reconnecting;
- a deletion on one device and an edit of the same item on the other: the later wins;
- a preset switched on one device while the other adds a highlight with the old preset's mark: the highlight keeps
  its mark, as the book's own;
- a stale `.orbis`: an item deleted elsewhere stays deleted, an item added elsewhere is put back — a notes set and the
  reading-records decision too;
- two writes that overlap on one device both survive;
- determinism: the same records in any order produce the same bytes;
- no records at all: the `.orbis` is unchanged, which is the no-migration guarantee.

Then on devices: the phone off the network, changes on both, reconnect — the scenario this exists for.
