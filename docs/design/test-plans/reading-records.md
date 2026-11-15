# Test plan — Reading records

← [Design Docs](../README.md)

Reading records: the first run, the vault settings, what one record holds and where it goes, the bases, a book's own settings, asking for each book, moving a book, and what deleting an annotation does to its record. What a user sees is in the guide: [Reading records](../../guide/reading-records.md).

**Not here:** making the marks, notes and bookmarks a record mirrors ([Marks and notes](marks-and-notes.md)), and the one-off exports ([Annotation exports](annotation-exports.md)). Each belongs to its own page.

**Two vaults.** The vault settings apply to every book, and they travel to your other devices, so the first run and the vault settings are tested in the repository's `test-vault`, opened as a vault of its own on the Mac. The rest runs in your synced vault on `fixtures/annotation-workhorse.epub` and `.mobi`, whose records go to a folder of their own, **Test reading records**, through each book's own settings — so no other book's records move.

Records are written about four seconds after a save, without a notice. Where a step says a note appears, give it those seconds.

---
## Where each step runs

Every step carries one tag.

| Tag       | Run it on                                                    |
| --------- | ------------------------------------------------------------ |
| `once`    | Any one device. The result does not depend on the device     |
| `each`    | Every device: Mac, Android, iPhone and iPad                  |
| `desktop` | The Mac — a pointer and a keyboard                           |
| `mobile`  | Android, iPhone and iPad — touch                             |
| `phone`   | Android and iPhone — a phone-sized screen                    |
| `ipad`    | The iPad                                                     |
| `android` | Android                                                      |

---
## Setup

- [ ] `desktop` Open `test-vault` in Obsidian. If **Orbis Reader: Reset reading records (dev)** is not in the palette, run **Orbis Reader: Toggle developer options** first. Run **Reset reading records (dev)**: **Reset reading records (dev)** lists the settings, book decisions and folders it will reset, with **Also delete the generated folders** ticked. Select **Reset**: a notice says what was reset. If `test-vault` was never set up, a notice says **Nothing to reset — reading records are already at their defaults on this device.** instead. Either way, `test-vault` is now "never set up".

- [ ] `once` In your synced vault, write down what **Settings → Orbis Reader → Annotations → Reading records** says, so Clean up can put it back. If **Write a reading record for each book as you read** is **Off**, set it to **Ask for each book**: a book's own **On** cannot override a vault that is off. Delete `fixtures/!orbis-data/annotation-workhorse.epub.orbis` and `annotation-workhorse.mobi.orbis` if an earlier run left them, and the two books' records an earlier run left in the vault's records folder — `annotation-workhorse (EPUB)` and `annotation-workhorse (MOBI)` under its `content/` — so a book's own settings have nothing to move.

- [ ] `once` Turn on the **`export`** pill in the debug log. Each pass logs a line starting `records:` — how many notes it created, updated and flagged orphaned, and each record a deletion removed or kept.

---
## The first run

In `test-vault`, on the Mac.

- [ ] `desktop` **Settings → Orbis Reader → Annotations → Reading records** shows one row: **Write a reading record for each book as you read**, with **Off**, **On for every book** and **Ask for each book**, set to **Off**.

- [ ] `desktop` Choose **On for every book**: **Where should reading records go?** opens — *Each book's reading record is a set of notes in your vault. This is where they will be written.* — with **Where each book's reading record goes** on **In one folder for every book**, **Folder for reading records** on `Reading records (will be created)`, and **Folder for the base covering every book**, whose first option is **Don't create one**. Select **Cancel**: a notice says **Reading records stay off until you choose where they go.**, and the row is **Off** again.

- [ ] `desktop` Choose **On for every book** again, leave both folders on `Reading records`, and select **Save**. The `Reading records` folder exists, and the page now also shows **Where each book's reading record goes**, **Folder for reading records**, **Create one base covering every book** (on) with **Folder for the base covering every book** under it, and **What gets added to the vault**.

- [ ] `desktop` In **Settings → Orbis Reader → Setup**, **Reading records** reads **Ready**.

---
## The vault settings

In `test-vault`, on the Mac.

- [ ] `desktop` Under **What gets added to the vault**, **Passage selections** and **Notes** are on and **Bookmarks** is off. Turn **Notes** off: **Passage selections**, the only one on, is grayed out and says **At least one of these has to stay on. Switch another on to turn this one off.** Turn **Notes** back on: both can be changed again.

- [ ] `desktop` Turn **Create one base covering every book** off: **Folder for the base covering every book** disappears. Turn it on: it comes back, on `Reading records`.

- [ ] `desktop` **Where each book's reading record goes** says *Puts every book's notes in one folder, with a subfolder for each book.*, and **Folder for reading records** says *Holds every book's reading record.* Set it to **Beside each book**: its description becomes *Puts each book's notes in a new folder next to the book, named after it.*, and **Folder for reading records** disappears. Set it back to **In one folder for every book**.

---
## What one record holds

In `test-vault`, on the Mac, in `fixtures/annotation-workhorse.epub`.

- [ ] `desktop` Mark a sentence in the first chapter with **Key point**. About four seconds later, with no notice, `Reading records/content/annotation-workhorse (EPUB)/` holds one note named `passage selection — ` followed by the sentence's first words and a six-character code. The book's name carries **(EPUB)** because `annotation-workhorse.mobi` sits beside it — each format keeps its own records.

- [ ] `desktop` Open that note. Its properties include `kind: passage selection`, `excerpt` (the sentence), `mark: Key point`, `book` (a link to the EPUB), `book_title`, `author`, `chapter`, `created` (today), `orphaned: false`, `link` and the tag `orbis-reading-record`. The body is the sentence as a quote, a **loc. N** link, and the line `<!-- Orbis: everything above is regenerated from the book. Your own notes go below. -->`.

- [ ] `desktop` Select the **loc. N** link: the book opens at the marked sentence.

- [ ] `desktop` Add a note to another passage, with the text **First test note**. A `note — …` record appears whose body has the quote, then **First test note**, then the link and the marker, and whose `note_text` property is **First test note**.

- [ ] `desktop` Add a bookmark: no record is written, since **Bookmarks** is off. Turn **Bookmarks** on, and run **Orbis Reader: Write this book's reading record…** in the book: a notice says **Reading record: 1 notes added, 0 updated.** — the bookmark's `bookmark — ` note is new, and the other two had nothing to change. Turn **Bookmarks** off again.

- [ ] `desktop` Below the marker in the passage's record, type **My own line**. In the book, change the passage's mark to **Quote**. In the record, `mark` reads **Quote**, and **My own line** is still below the marker.

---
## The bases

In `test-vault`, on the Mac.

- [ ] `desktop` `Reading records/annotation-workhorse (EPUB).base` and `Reading records/!Reading records.base` exist. Open the book's base: it opens on **All selections (list)**, grouped by chapter, showing the passage and the note but not the bookmark.

- [ ] `desktop` The base's views come in pairs, each as a list and as a table: **All selections**, **Selections with a mark**, **Bookmarks**, **Passage selections**, **Passage selections by mark**, **Notes**, **Notes by mark**, **Notes without a mark**, **Recently added**, and **All selections and bookmarks** — twenty in all. **Bookmarks** shows the bookmark. **All selections and bookmarks (list)** and **Recently added (list)** show it too, as the opening lines of the bookmarked page — in the list layout as well as the table.

- [ ] `desktop` Open `!Reading records.base`: the same views, grouped by book title.

---
## Moving the book

In `test-vault`, on the Mac.

- [ ] `desktop` Mark a sentence and close the book's tab within a couple of seconds. Its record appears, `orphaned: false`, and every other record of the book is still `orphaned: false` — the book's base shows them all.

- [ ] `desktop` With the book closed, rename `annotation-workhorse.epub` to `annotation-workhorse-moved.epub`, and answer **No** when Obsidian asks whether to update links. Its records folder is now `Reading records/content/annotation-workhorse-moved/` — no **(EPUB)**, since the MOBI no longer shares its name — the old `annotation-workhorse (EPUB)/` folder is gone, and `annotation-workhorse.base` became `annotation-workhorse-moved.base`, still showing every record. In each record, `book` is `[[fixtures/annotation-workhorse-moved.epub]]`, and `link_url` and the **loc. N** link in the body both name `annotation-workhorse-moved.epub`, without the book being opened. The book's title note, `fixtures/library/Annotation Workhorse.md`, lists `[[fixtures/annotation-workhorse-moved.epub]]` in `files` and embeds it in its body, and the Library still shows the book under that note.

- [ ] `desktop` Select a record's **loc. N** link: the renamed book opens at its passage. Leave it open, mark a sentence, and straight away rename the book back to `annotation-workhorse.epub`, answering **Yes** this time: the records — the new one included — move back to `annotation-workhorse (EPUB)/`, the base shows them all, and `book` names `annotation-workhorse.epub`. Mark another sentence in the still-open book: its record is written there too.

---
## Deleting an annotation

In `test-vault`, on the Mac.

- [ ] `desktop` Mark a new sentence and wait for its record. Remove the mark in the book: the record is gone from the folder, and is in Obsidian's trash — no notice, no question.

- [ ] `desktop` Remove the passage whose record has **My own line** below the marker: the record stays, with `orphaned: true`. It no longer appears in the base, which leaves out orphaned records.

- [ ] `desktop` Mark another sentence, add a property of your own to its record — **rating: 3** — and remove the mark: the record stays, `orphaned: true`. Mark one more, and link to its record from a note elsewhere in the vault — type `[[` in that note and pick the record; any link Obsidian resolves to it counts. Remove the mark: it stays too, `orphaned: true`.

- [ ] `desktop` Delete the note **First test note** in the book. With **Confirm before deleting notes** on in **Settings → Orbis Reader → Reading behavior**, it asks **Delete note** — *Delete this note? This cannot be undone.* Select **Delete**: its record is trashed, since nothing of yours is in it.

- [ ] `desktop` Run **Orbis Reader: Remove records of deleted content…**. **Remove records of deleted content** lists the three kept records under *3 notes are kept, because you wrote in them, added properties, or linked to them from another note. Delete these by hand if you want them gone:* with no **Remove** button, since none can go. Select **Cancel**.

- [ ] `desktop` Delete **rating** from the kept record's properties, and run the command again: it now says *1 note can be removed. Nothing of yours is in it.*, with **Remove 1**. Select it: **Removed 1 note.**, and that record is in the trash. Remove the link from the other note and run the command again: the record it pointed at can be removed now too.

---
## A book's own settings

In your synced vault, on `fixtures/annotation-workhorse.epub`.

- [ ] `each` Open the book. In the reader's **⋯** menu, select **Reading record settings…**: **Reading record settings** opens, starting with the vault's position — **Vault setting: ask for each book.** if you set it so in Setup — then **Reading record for this book** with **Follow the vault setting**, **On for this book** and **Off for this book**, and a line saying what that comes to. **Orbis Reader: Reading record for this book…** in the palette opens the same dialog.

- [ ] `once` Choose **On for this book**: the line reads **Reading record: Active.**, and **What gets written** and **Where they go** appear. **Follow vault settings** is on, with the three kinds grayed out. **Save to** offers **Follow vault default — …** naming where that is, **Beside the book**, **The shared records folder** and **A folder you choose**. Choose **A folder you choose**. **Folder** reads `/`, the vault's top: create **Test reading records** with the **+** beside it, and the path under it becomes `Test reading records/content/annotation-workhorse (EPUB)`. No **Moves N existing notes here.** line shows, since the book has no records yet. Select **Save**: **This book's reading record is on.**

- [ ] `each` Mark a sentence: its record appears in `Test reading records/content/annotation-workhorse (EPUB)/`, with `Test reading records/annotation-workhorse (EPUB).base` beside it. On another device, once the vault has synced, the record is there, and opening the book there leaves it `orphaned: false`.

- [ ] `once` In the dialog, set **Save to** to **Beside the book**. A line says **Moves 1 existing notes here.** Select **Save**: the record is now in `fixtures/annotation-workhorse (EPUB)-reading-records/content/`, with the base in the folder above it, and `Test reading records/` has no `content/` folder left in it — the book's subfolder, then the emptied `content/`, are gone. Set it back to **A folder you choose**, **Test reading records**: it moves back.

- [ ] `once` Choose **Off for this book**: **What gets written** and **Where they go** go away, and a line says **1 existing notes stay where they are. Nothing is deleted.** Select **Save**: **This book's reading record is off. Existing notes were left in place.** Mark a sentence: no record is written. Run **Write this book's reading record…**: **This book's reading record is off.** Set the book back to **On for this book**.

---
## Asking for each book

In your synced vault, with **Write a reading record for each book as you read** on **Ask for each book**, on `fixtures/annotation-workhorse.mobi`, which has no decision yet.

- [ ] `each` Open the MOBI and mark a sentence. About six seconds later **Reading record settings** opens by itself, with **Vault setting: ask for each book.** and the choice already on **On for this book**. Select **Cancel**: nothing is written, and it does not ask again while Obsidian stays open.

- [ ] `once` Restart Obsidian, open the MOBI, and add a bookmark: with **Bookmarks** off in **What gets added to the vault**, nothing asks — a bookmark would not be recorded. Mark a sentence: it asks again. Set **Save to** to **A folder you choose**, **Test reading records**, and select **Save**: both sentences' records appear in `Test reading records/content/annotation-workhorse (MOBI)/`, and the bookmark's does not.

- [ ] `once` In the MOBI's dialog choose **Follow the vault setting**: the line reads **Reading record: Inactive — you'll be asked on your next selection or note.** Select **Save**: **This book's reading record follows the vault setting.** Mark another sentence: about six seconds later it asks again.

---
## Turning it off

- [ ] `once` In your synced vault, set **Write a reading record for each book as you read** to **Off**. Nothing in **Test reading records** is deleted, and marking a sentence in the EPUB writes nothing — the vault being off outweighs the book's own **On**. Set it back to **Ask for each book**.

### Clean up

- [ ] `once` In your synced vault, put **Settings → Orbis Reader → Annotations → Reading records** back as you wrote it down. Delete the **Test reading records** folder and any `annotation-workhorse (EPUB)-reading-records` folder in `fixtures/`, and the two books' `.orbis` files if the next run should start clean. Delete the note you linked from, in `test-vault`.

- [ ] `desktop` In `test-vault`, run **Reset reading records (dev)** again, with **Also delete the generated folders** ticked, so the next run starts never set up.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
