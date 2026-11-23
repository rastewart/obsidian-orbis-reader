# Test plan — The .orbis file and resilience

← [Design Docs](../README.md)

Where Orbis Reader keeps a book's data, the page that shows it, and what happens when that data — or the book — is moved, renamed, deleted or damaged, or when the book itself is broken or hostile. What a user sees is in the guide: [The .orbis File](../../guide/orbis-file.md).

**Not here:** making marks, notes and bookmarks ([Marks and notes](marks-and-notes.md)); a deleted `.orbis` clearing marks on every device ([Sync](sync.md)); reading records following a renamed book ([Reading records](reading-records.md)); the Navigator's tabs other than **Linked vault notes** ([Reading a book](reading-a-book.md)); the Library's **Reading data** item, which needs a title note the scratch books do not have ([Library dashboards](library-dashboards.md)).

**One scratch folder.** Every step that moves, renames, deletes or damages something works on copies in `fixtures/resilience/`, made in Setup, so the shared fixtures are never touched. It lives in your synced vault, so the phones and the iPad see the same books.

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

- [ ] `desktop` In Finder, copy the repository's `test-vault/fixtures/resilience` folder into the synced vault's `fixtures` folder. It holds four books: `Workhorse Copy.epub` — a copy of `annotation-workhorse.epub`, with a space in its name — `First-Open.epub`, and two broken ones, `empty.epub` (no bytes at all) and `not-a-book.epub` (a line of text).

- [ ] `desktop` Copy `test-vault/fixtures/hostile-scripts.epub` from the repository over the synced vault's `fixtures/hostile-scripts.epub`: the book was rebuilt for this page. Copy `test-vault/fixtures/link-checks.epub` and `test-vault/fixtures/frame-navigation.epub` into the synced vault's `fixtures` folder too.

- [ ] `once` Wait until the phones and the iPad show `fixtures/resilience` with its four books.

---
## The data folder

- [ ] `desktop` Open `Workhorse Copy.epub` and turn a few pages. In Finder, `fixtures/resilience/!orbis-data/` now holds `Workhorse Copy.epub.orbis`, `Workhorse Copy.epub.location.<id>.json` and `Workhorse Copy.epub.marks.<id>.json` — `<id>` is this device's — and, once the location index has built, `Workhorse Copy.epub.pages.json` — beside `!readme.md`, written when the folder was made.

- [ ] `desktop` Open `!readme.md` in Obsidian: **Orbis Reader Data**, *This folder is managed by the Orbis Reader plugin. Do not rename or delete files here manually.*, and a table of the files. Add a line of your own to it, then run **Show reading data for this book**: your line is gone.

- [ ] `desktop` Delete `!readme.md`, then select `Workhorse Copy.epub.orbis` in the Files pane: the reading data opens, and `!readme.md` is back.

- [ ] `once` In `Workhorse Copy.epub`, make one bookmark, two passage selections and one note, so the reading data has something in every section.

---
## Opening the reading data

- [ ] `desktop` In `Workhorse Copy.epub`, open the book's **⋯** menu and choose **Show reading data**. It opens beside the book, in a split, with the tab named **Workhorse Copy.epub**. Choose it again: the same tab comes forward, and no second one opens.

- [ ] `phone` Open the book's **⋯** menu and choose **Show reading data**. The reading data opens in a new tab. The back arrow does not return to the book: select the tab count in Obsidian's toolbar, then the book's tab.

- [ ] `ipad` Holding the iPad upright, with the book filling the screen, open the book's **⋯** menu and choose **Show reading data**. It opens below the book, in a split, with the tab named **Workhorse Copy.epub**: side by side, each pane would be too narrow for the reader's toolbar. Close it, turn the iPad sideways, and choose **Show reading data** again: this time it opens beside the book, as on the Mac.

- [ ] `once` With the book's tab active, the palette lists **Show reading data for this book**. With the reading data's tab active, it does not.

- [ ] `once` In the Files pane, open `fixtures/resilience/!orbis-data/` and select `First-Open.epub.orbis` — or open `First-Open.epub` first if it is not there: its reading data opens.

---
## What the reading data shows

All in **Workhorse Copy.epub**'s reading data.

- [ ] `each` At the top: the book's cover, **Annotation Workhorse**, **Orbis Tester**, and **1 bookmark · 2 passage selections · 1 note**.

- [ ] `once` Turn a few pages at a normal reading speed, then look under the cover: **Last read:** and today's date. After eight such pages, **Average reading speed: N wpm ·** comes before it, the same speed as **Estimated reading speed** in the book's **Reading stats** tab.

- [ ] `each` **Reading activity** has the columns **Device**, **Last opened** and **Last location**, and one row for each device that has opened the book, newest first. **Last location** is a link such as **loc. 12** — the start of the chapter the device was in, so it may be lower than the reader's own count. Select another device's link: the book opens at that device's place.

- [ ] `each` Below, five sections, all closed: **Contents**, **Bookmarks**, **Passage selections**, **Notes** and **Linked vault notes**. Each but **Contents** has a count beside it when it holds anything. Open **Contents**: the book's chapters, with any entry that sits under another set in. Select one: the book opens there.

- [ ] `each` Open **Bookmarks**, **Passage selections** and **Notes**. A bookmark shows its chapter and **loc. N**; a passage selection adds its color and the passage; a note adds what you wrote. Select any row: the book opens at that place.

- [ ] `once` Open `First-Open.epub`'s reading data, a book with no marks: **Bookmarks**, **Passage selections** and **Notes** each say **None yet.**, and the line of counts under the title is not there.

- [ ] `once` Open `running-header.epub` and then its reading data. **Contents** has more than thirty entries, and the list scrolls inside its section rather than making the page longer.

- [ ] `once` Open `sample-comic.cbz` and then its reading data. **Contents** lists the pages by their image file names. **Passage selections** and **Notes** say **None yet.**, and there is no **Average reading speed**.

---
## Linked vault notes

- [ ] `desktop` In `Workhorse Copy.epub`, select a sentence and choose **Copy link to selection**. Make a note named **Linked test** in `fixtures/resilience` and paste the link into it, and nothing else. In the reading data, open **Linked vault notes**: **Linked test** is listed, with `fixtures/resilience` under it. The book's name has a space, which the link carries as `%20`.

- [ ] `desktop` Make a second note, **Wiki test**, holding only `[[Workhorse Copy.epub]]`. The reading data redraws when the book next changes — mark a sentence — and **Wiki test** is listed too. Select it: it opens in a new tab.

- [ ] `desktop` In the book, open the Navigator's **Linked vault notes** tab: both notes are listed. Make a third note linking to the book: the tab does not list it until you close the book's tab and open the book again.

---
## The page keeps up with the book

- [ ] `desktop` Put the reading data beside the book. Mark a sentence in the book: **Passage selections** counts one more, and the line under the title changes with it, without reopening anything.

- [ ] `desktop` Make the reading data's tab the active one, then select `First-Open.epub.orbis` in the Files pane, so the same tab now shows **First Open**. Mark a sentence in `Workhorse Copy.epub`: the tab still shows **First Open**, not **Annotation Workhorse**.

---
## Scan annotation data for problems

- [ ] `once` With a book's tab active, the palette lists **Scan annotation data for problems**. With a note active, it does not.

- [ ] `once` In `Workhorse Copy.epub`, run it: **Annotation data check**, saying *No problems found — all selections and notes look healthy.*, with **Close**. Broken and duplicate marks cannot be made from the reader; `annotation-repair.test.ts` checks that the scan finds them, and the end-to-end test *scan puts a mark and a note stored empty back on their passages* that it offers **Repair** for one stored empty on its paragraph, as a paragraph mark made while a recording played was before 0.1.7.

- [ ] `once` If a vault holds a book with a paragraph mark or note made from the listening player while a recording played, before 0.1.7, open that book and run the scan. Such a mark shows nothing in the book, and the scan lists it as *broken range · can be repaired*, with *N of them can be put back where they were made.* Select **Repair**. A notice says *Repaired 1 passage selection* (or notes), and the passage is marked again.

---
## Moving, renaming and deleting a book

- [ ] `desktop` Open `First-Open.epub` in `fixtures/resilience`, mark a sentence, and close it. In Obsidian's Files pane, rename it to `First-Open renamed.epub`. In `!orbis-data`, every `First-Open.epub.…` file is now `First-Open renamed.epub.…`. Open the book: your mark and your place are there.

- [ ] `desktop` In the Files pane, drag `First-Open renamed.epub` into `fixtures`. `fixtures/!orbis-data/` now holds its files, and `fixtures/resilience/!orbis-data/` no longer does. Open it: the mark and the place came too. Drag it back into `fixtures/resilience` and rename it `First-Open.epub`.

- [ ] `desktop` With Obsidian running, move `First-Open.epub` in Finder from `fixtures/resilience` into `fixtures`. No notice appears. Within a few seconds, `fixtures/!orbis-data/` holds every `First-Open.epub.…` file, and `fixtures/resilience/!orbis-data/` no longer does. Open the book from `fixtures`: your mark and your place came with it. On Android, once it has synced, open it from `fixtures` too: the mark is there, and Android shows no notice. Close it everywhere, and move it back in Finder on the Mac: its files follow it back.

- [ ] `desktop` With Obsidian running, rename `First-Open.epub` in Finder to `First-Open finder.epub`. Obsidian sees a book deleted and another added, and the new name means Orbis Reader cannot tell it was moved: after a few seconds, *Orbis Reader: removed reading data for "First-Open".*, and its files are wherever **Settings → Files and links → Trash → Deleted files** sends a deleted file — with **Move to system trash**, the Mac's Trash. Open the book: no mark, and it starts at the beginning. Rename it back to `First-Open.epub` in Obsidian.

- [ ] `desktop` Open `First-Open.epub`, mark a sentence, and close it. In the Files pane, delete the book. After a few seconds: *Orbis Reader: removed reading data for "First-Open".*, and its files are gone from `!orbis-data` — into the same trash as the book. Restore the book and its `First-Open.epub.…` files from the trash to where they were — with **Move to system trash**, select them in the Mac's Trash and choose **Put Back**: the book opens with your mark and at your place.

- [ ] `desktop` Delete `Workhorse Copy.epub.pages.json`. Open the book: it opens at your place, and once the location index has built the file is back.

- [ ] `once` In `fixtures/resilience`, delete the whole `!orbis-data` folder while Obsidian is running. It comes straight back, holding one `<book>.marks.<id>.json` for each book that had data — the record that the book was cleared. Open `Workhorse Copy.epub`, closing **Device locations** if it appears: no marks, notes or bookmarks, and it starts at the beginning. The same is true of every other book in the folder, not just this one.

- [ ] `desktop` Turn **Orbis Reader** off in **Settings → Community plugins**, delete `fixtures/resilience/!orbis-data` again, and turn Orbis Reader back on. This time the folder stays deleted until a book in the folder is opened.

---
## Damaged data

- [ ] `desktop` In `Workhorse Copy.epub`, mark two sentences, then close the book. In Finder, open `Workhorse Copy.epub.orbis` in TextEdit, replace everything in it with `null`, and save. Within a second Orbis Reader writes it again from this device's record of its marks: open it in TextEdit and both marks are in it. Open the book: both marks are there, and no error appears.

- [ ] `desktop` Close the book. Replace everything in `Workhorse Copy.epub.location.<id>.json` — this device's — with `{ not json` and save. Open the book. If **Device locations** offers another device's place, close it. The book opens at the beginning, with no error. Turn a few pages, close it and open it again: it opens where you left it.

- [ ] `desktop` Replace everything in `Workhorse Copy.epub.orbis` with `{ not json` and save, then select the file in the Files pane at once. The reading data shows the book with its marks — Orbis Reader has already written it again — or, for a moment, **Could not load reading data.**

---
## Books that cannot be opened

- [ ] `each` Open `fixtures/resilience/not-a-book.epub`: a notice *Orbis Reader error: This file isn't a valid EPUB file*, and the same sentence in the middle of the tab, still there after the notice has gone. There is no toolbar and no page, on a phone as on the Mac. Obsidian keeps working; close the tab.

- [ ] `each` Open `fixtures/resilience/empty.epub`: *Orbis Reader error: This file is empty*, in the notice and in the middle of the tab, with no toolbar. Close the tab.

- [ ] `desktop` Make a cut-off copy of `First-Open.epub`, as a download that stopped part-way would leave it: in Terminal, in `fixtures/resilience`, run `head -c 10000 First-Open.epub > cut-off.epub`. Open it: *Orbis Reader error: This EPUB file is damaged and can't be opened*, in the notice and in the middle of the tab. With the debug log's `index` category on, the log has the engine's own words: **open failed: DamagedBookError: End of central directory not found**, or similar.

---
## A hostile book

- [ ] `each` Open `fixtures/hostile-scripts.epub`. It opens with no notice. Under **Script execution checks**, every row reads **PASS — nothing executed.** with a green bar on its left, and the last reads **PASS — no escape attempted, because no script ran.** No row reads **FAIL**, and no row is red.

- [ ] `each` Select **Select this link.**: a notice says *Orbis Reader doesn’t open links that run scripts.*, nothing else happens, and the line under it still reads **PASS — nothing has run from that link.**

- [ ] `each` Stay on **Script execution checks** for ten seconds: the page is still there, and does not flicker. Only Android shows a refresh that got through, so on the other devices this step proves nothing.

- [ ] `each` Turn to **Markup hidden as text**. It has six rows, `cssbreak`, `mathstyle`, `mathxmp`, `noscript`, `svgxmp` and `svgstyle`, and each reads **PASS unless a FAIL row naming "…" appears on this page.** with a green bar on its left. Under the `mathxmp` row, a line of markup beginning `<p class="check fail breakout"` is shown as plain text, as the row says it should be. No red row beginning **FAIL — the check** appears anywhere in the chapter: on a phone, turn to its second page too.

- [ ] `each` Stay on **Markup hidden as text** for ten seconds: the page is still there, and does not flicker. Only Android shows a refresh that got through; elsewhere the FAIL rows are the check. The `noscript` row can only fail on iPhone, iPad and Android, where the reader's frame allows scripts, so a desktop PASS proves nothing for it.

- [ ] `each` Turn to **An ordinary chapter**: **PASS — if you can read this, the book renders normally after hardening.** Select **this link back to the first chapter**: the first chapter, not a browser and not `example.invalid`.

- [ ] `each` Turn to **A chapter that must appear**: it shows its heading, two rows with green bars, and a line of text below each. A failure is a blank page, the previous chapter still showing, or the whole chapter as plain paragraphs under the note **Orbis Reader shows this chapter as plain text because its markup could not be made safe to display.**

- [ ] `each` Turn to **A chapter with no doctype**: one row, reading **PASS unless a FAIL row naming "quirks" appears in this chapter.**, and no red row. A line reading `<!--` below the row is expected, as the row says. The `quirks` row can only fail on iPhone and iPad, if at all: in Chrome the frame and the hardening read a chapter without a doctype the same way.

- [ ] `each` Turn to **A book cannot choose the page color**: one row with a green bar, and the page behind it, margins included, is the reader theme's color. A failure is a red page with **FAIL** written across it in white.

- [ ] `each` With **A book cannot choose the page color** showing, change the reader theme: the whole page, margins included, takes the new theme's color, and no red or **FAIL** appears.

---
## Links out of a book

Every row of `fixtures/link-checks.epub` says under its link what to expect. The steps below are those rows. Where a step says to write down what happens after **Open**, that part belongs to Obsidian and the system, and the answers go in `docs/design/security.md`.

- [ ] `each` Open `fixtures/link-checks.epub` and select the link in row 1. **Open this link?** has four rows: **Link type** *Web page*, **Domain** `example.com` in bold, then **Link text** and **Link address**, both reading `https://example.com/` in a code font on a shaded background, with `example.com` bold in the address and a copy button to its right. On a computer each label is beside its value; on a phone, above it. No orange lines. The buttons are **Cancel** and **Open**, and **Open** is in the theme's accent color. Select **Open**: the page opens.

- [ ] `desktop` Select row 1's link again and press Enter without selecting anything: the dialog closes and nothing opens, because **Cancel** has the keyboard.

- [ ] `each` Row 2: **Domain** reads `www.example.com`, and there are no orange lines — `example.com` in the text and `www.example.com` in the address are the same site. Select **Cancel**.

- [ ] `each` Row 3: **Domain** reads `example.org`. Under **Link text**, an orange line reads *The link text shows example.com. The link address goes to example.org.* Above the buttons: *This link may be unsafe. Open it only if you trust the book’s source.* **Open** is red. Select the copy button beside **Link address**: a notice says *Address copied to clipboard*. Paste it into a note: `https://example.org/sign-in`. Select **Cancel**.

- [ ] `each` Row 4: **Domain** reads `example.net`. Under **Link address**, an orange line reads *The link address has a name before “@” (example.com). The domain is example.net.* Select **Cancel**.

- [ ] `each` Row 5: **Domain** reads `xn--exmple-4nf.com`, and under it an orange line names a character outside the basic Latin alphabet as Cyrillic, `U+0430`. Under **Link text**, a second line: the link text shows `example.com`, the link address goes to `xn--exmple-4nf.com`. Write down exactly what this device shows. Select **Cancel**.

- [ ] `each` Row 6, the same look-alike written already encoded: under **Domain** `xn--exmple-4nf.com`, the same orange line as row 5, naming the character as Cyrillic, `U+0430`. **Open** is red. Select **Cancel**.

- [ ] `each` Row 7: **Domain** reads `example.com`, and **Link address** reads `https://example.com/`. No orange line and no sentence above the buttons; under **Link address**, a grey note reads *The link address in the book has characters you can’t see. It’s shown here as it will be opened.* **Open** is in the accent color. Select **Cancel**.

- [ ] `each` Row 8: in the book the link reads `invoiceexe.pdf`. **Link text** reads `invoice[U+202E]fdp.exe`, and under it a grey note reads *Characters you can’t see in the book are shown as codes, such as [U+202E].* No orange line, and **Open** is in the accent color. Select **Cancel**.

- [ ] `each` Row 9: no orange lines. The whole address shows, wrapped over several lines, with no sideways scrolling, and the buttons are on screen without scrolling. Select **Cancel**.

- [ ] `each` Row 10, a picture: **Link text** reads *(a picture: A blue square)*. Select **Cancel**.

- [ ] `each` Rows 11 to 14 — **Link type** reads *Email* (with **Domain** `example.com`), *Phone number*, *Obsidian link (search)* and *File on this device*; the last three have no **Domain** row. Select **Open** on each. On a computer, the email, phone and file links each show Obsidian's own warning, *This link will open an external application outside of Obsidian…*; select **Open Link** on the email one only. On Android, email opens the share sheet of email apps and the phone link opens the dialer. On iPhone, email opens the email app and the phone link asks whether to call. On the iPad, email opens the email app and the phone link does nothing. On every device, the Obsidian link opens Obsidian search with `orbis-link-check` and no warning from Obsidian, and on a phone or tablet the file link does nothing. Discard the email draft and don't place the call. The results are recorded in `docs/design/security.md`; a change from them is worth reporting.

- [ ] `each` Rows 15 and 16, script links: no dialog. Each shows the notice *Orbis Reader doesn’t open links that run scripts.*

- [ ] `each` Row 17: **Link type** reads *Not a valid address*, there is no **Domain** row, and there is no **Open** button, only **Cancel**; the copy button is still beside the address.

- [ ] `each` Row 18: no dialog; `fixtures/hostile-scripts.epub` opens in the same tab. Go back to `link-checks.epub` with Obsidian's back arrow.

- [ ] `each` Row 19, a link inside the book: no **Open this link?** dialog. With **Link preview** on, the link preview opens with **Go**; select it to reach **The second chapter**.

- [ ] `each` Row 20, an image map: select the blue square. **Open this link?** shows **Link address** `https://example.com/image-map` and **Link text** *(a picture: A blue square)*. Select **Cancel**. A failure is no dialog, with the chapter flickering, going blank, or stuck on **Restoring position**.

- [ ] `each` Row 21, an SVG link: select the green square. **Open this link?** shows **Link address** `https://example.com/svg-link` and **Link text** *A green square*. Select **Cancel**. A failure looks like row 20's.

- [ ] `each` Row 22, a formula: select **x + y**. **Open this link?** shows **Link address** `https://example.com/formula`. Select **Cancel**. A failure on iPhone and iPad is no dialog and a flicker; Mac, Windows and Android followed nothing here even before the fix.

- [ ] `each` Row 23, an image map to an Obsidian action: select the second blue square. **Open this link?** shows **Link type** *Obsidian link (search)*. Select **Cancel**: nothing opens. A failure, seen on Android before the fix, is Obsidian's search opening with `orbis-image-map-check` and no dialog.

---
## Links the reader cannot see

`fixtures/frame-navigation.epub` holds links the reader's link handler cannot read, and every row should do nothing. A row that gets through sends the chapter's frame away: a flicker, a blank page, an Obsidian action, or — the failure the book exists to find — a red banner across the top of Obsidian beginning **ESCAPED**, which only a script from the book running in Obsidian's own window can draw. See `docs/design/security.md`, "A chapter stays in its frame".

- [ ] `each` Open the debug log and turn on the **display** pill. Open `fixtures/frame-navigation.epub`. The log does not say *this device has no Navigation API*; if it does, write down the device's system version.

- [ ] `each` Rows 1 to 3: select the purple, magenta and violet squares. Nothing happens: no flicker, no blank page and no red banner. A red banner is a script from the book running in Obsidian's window: select it to remove it, and report it.

- [ ] `each` Rows 4 and 6, Obsidian actions: select the orange and green squares. Nothing happens, and Obsidian's search does not open.

- [ ] `each` Rows 5, 7, 8 and 9, web pages: select the teal square, the yellow box, the brown square and the grey square. Nothing happens. In row 9, selecting **More** opens and closes the text under it.

- [ ] `each` Row 10: select **Search the vault**. Nothing happens: the chapter's policy stops a form before it goes anywhere.

- [ ] `each` Through rows 1 to 10 the log shows no *kept the chapter in its frame* line: the reader's link handler stops a tap inside SVG before the frame starts to go anywhere (ORBIS patch 27), so the frame's own refusal has nothing to refuse. A *kept the chapter in its frame* line means something got past the link handler: write down which row.

- [ ] `desktop` The frame's own refusal, which no tap on the fixture reaches: with the book open, open the developer tools (**Cmd+Option+I** on the Mac, **Ctrl+Shift+I** on Windows) and run `document.querySelector('foliate-view').renderer.getContents()[0].doc.defaultView.location.href = 'https://example.com/console'` in the console. The page stays as it was, and the log shows *kept the chapter in its frame: refused a navigation to `https://example.com/console`*.

- [ ] `mobile` Press and hold the purple square, then the teal one. If the system offers to open the link, select that: the chapter stays as it was, and no red banner appears. Write down what the system offered.

- [ ] `each` Open **A chapter that holds a script** from the contents. It shows its text and nothing else: no red banner.

---
## Reload and restart

- [ ] `desktop` In `Workhorse Copy.epub`, turn a few pages and wait two seconds. Run **Reload app without saving**: the book opens on the same page, with no error notice.

- [ ] `mobile` In `Workhorse Copy.epub`, turn a few pages and wait two seconds. Close Obsidian completely and open it again: the book opens on the same page.

- [ ] `desktop` With `Workhorse Copy.epub` open, turn **Orbis Reader** off in **Settings → Community plugins**. The book's tab closes — Obsidian closes a tab whose kind of view has gone — and Settings may close with it. Turn Orbis Reader back on, and open the book again: it opens on the page you left, with no error notice.

---
## Clean up

- [ ] `once` In the synced vault, delete `fixtures/resilience`, with its books, its `!orbis-data` and the notes made in it. The copy in `test-vault` stays for the next run. Wait until the other devices no longer show it.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
