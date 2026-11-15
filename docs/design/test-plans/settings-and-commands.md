# Test plan — Settings and commands

← [Design Docs](../README.md)

Orbis Reader as a whole rather than one capability of it: the welcome a new install meets, the **Settings → Orbis Reader** page and its **Setup** checklist, finding your way around Settings, developer options, and the command palette's commands that no other page covers. What a user sees is in the guide: [Settings reference](../../guide/settings-reference.md) and [Command reference](../../guide/command-reference.md).

**Not here:** each capability's own settings and commands, which its own page tests — reading and the toolbar ([Reading a book](reading-a-book.md)), display styles ([Display](display.md)), marks and the **Marks manager** ([Marks and notes](marks-and-notes.md)), and so on for every page in this folder. The ribbon icons are on [Library dashboards](library-dashboards.md) and [Book sources](book-sources.md); the file menu's items on [Notes to EPUB](notes-to-epub.md) and [Library dashboards](library-dashboards.md). **Scan annotation data for problems** and **Show reading data for this book** belong to [The .orbis file and resilience](orbis-file-and-resilience.md).

**Two vaults.** The welcome and the Setup checklist start from a factory reset, which is only ever run in the repository's `test-vault` on the Mac: it forgets this device and trashes every reading-location file in the vault. Everything else runs in your synced vault.

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

- [ ] `desktop` Open `test-vault`. If **Factory reset — back to a new install (dev)** is not in the palette, run **Orbis Reader: Toggle developer options**: *Orbis Reader developer options are on: extra commands in the palette, and extra settings.*

---
## The welcome

In `test-vault`, on the Mac.

- [ ] `desktop` Run **Factory reset — back to a new install (dev)**: **Factory reset Orbis Reader?**, six paragraphs starting *Every Orbis Reader setting goes back to its default and this device is forgotten* and ending *Obsidian reloads afterwards.*, with **Cancel** and a red **Reset**. Select **Cancel**: nothing happens. Run it again and select **Reset**: a notice starting *Orbis Reader reset to a new install —*, then Obsidian reloads.

- [ ] `desktop` After the reload: **Welcome to Orbis Reader**, under **Orbis Reader** — *Read books in several formats inside your vault, or listen to them read aloud with text-to-speech. Add your own marks and notes to the text, then save your annotations as Obsidian notes or a PDF.* and *To get started, visit Setup in Orbis Reader settings.* — with **Got it** and **Open setup** in the accent color, not red. **Got it** has the focus: press **Enter** and the welcome closes. Reload: no welcome.

- [ ] `desktop` The reset forgot developer options too: run **Toggle developer options** again. Run **Reset the welcome (dev)** and reload: the welcome again. Select **Open setup**: Settings opens on the **Setup** page itself, with a back arrow. Select the back arrow: **Orbis Reader**, whose first entry is **Setup**, reading **0 of 7**. Close Settings.

- [ ] `desktop` Run **Reset the welcome (dev)**: *Welcome forgotten for this device. Reload Obsidian to be greeted again.* Without reloading, open `fixtures/annotation-workhorse.epub`: the welcome appears over the book. Select **Got it**, then open another book: no welcome.

- [ ] `desktop` Run **Reset the welcome (dev)** again. In **Settings → Community plugins**, turn **Orbis Reader** off and back on: the welcome appears over Settings, in front of Community plugins, which is where a new install meets it. Select **Got it**.

---
## The Settings page

- [ ] `each` **Settings → Orbis Reader** lists, in order: **Setup** (*Tailor Orbis Reader by enabling the capabilities you want to use.*, with **N of 7** on the right), **Appearance** (*Change how books look and adjust the reader toolbar.*), **Reading behavior** (*Adjust how the reader behaves while you read.*), **Listening** (*Listen to books read aloud by text-to-speech.*), **Annotations** (*Manage annotation marks, reading records, and how annotations are saved as Markdown or PDF.*), **Look-up** (*Look words up without leaving the book.*), **Library dashboards** (*Build dashboards to browse, group and summarize your books.*), **Book sources** (*Connect to an OPDS feed and download books into your vault.*), **Conversions** (*Convert books and Obsidian notes into other formats.*) and **Devices** (*Enable Orbis Reader configuration sharing in the vault so a sync tool can share it with your other devices.*).

- [ ] `each` Last comes **Orbis Reader**, *Version* and the installed version, with no control. Selecting it does nothing.

- [ ] `once` In `test-vault` after the reset, open **Listening**: **Live voice** reads **Amy · not downloaded**, since nothing is downloaded yet, with no warning triangle, and **Hear the live voice** is dimmed. **Recorded voice** reads **Amy · not downloaded** too: recording on this device is on from the start, with Amy as its voice.

---
## The Setup page

- [ ] `each` Open **Setup**. Under **Appearance**: *These controls change this device's display style.* and *For the rest, see Appearance in settings or the display style button on the reader's toolbar while you are reading.*, then **Reader theme** (**Match light or dark mode**, **Match Obsidian's theme**, **Light**, **Sepia**, **Dark**), **Font size** (a slider with a number, 80 to 300) and **Preview**. There is no font row.

- [ ] `each` Below that, *Tailor Orbis Reader by enabling the capabilities you want to use.*, then seven rows, each **Ready** or showing its button: **Book sources** (**Set up**), **Look-up** (**Download**), **Library dashboards** (**Set up**), **Reading records** (**Set up**), **Listening** (**Choose**), **Expanded PDF character set** (**Download**) and **Devices** (**Set up**). The count on the Orbis Reader page is how many are **Ready**.

- [ ] `once` Set **Reader theme** to **Sepia** and move **Font size**: **Preview** follows each change. Open a book: it is sepia at that size, and **Appearance** shows the same two values. Put both back.

- [ ] `desktop` In `test-vault`, every row shows its button. Select each in turn and cancel what it opens: **Book sources** opens **Enable book sources**, **Library dashboards** **Enable the library**, **Reading records** **Where should reading records go?** — cancelling it says *Reading records stay off until you choose where they go.* — **Listening** **Choose a voice**, and **Devices** **Use this vault on more than one device**. After each, the row still shows its button and the count is still **0 of 7**.

- [ ] `desktop` Select **Download** on **Look-up**: it reads **Downloading…** and cannot be selected, then the row reads **Ready** and the Orbis Reader page **1 of 7**. Do the same on **Expanded PDF character set**: **2 of 7**.

---
## Finding your way around

- [ ] `each` Select **Reading behavior**: its page opens with a back arrow and its name at the top. Select the back arrow: the Orbis Reader page again.

- [ ] `desktop` With the keyboard: put the focus on **Reading behavior** and press **Enter**: its page opens. Press **Tab** until the switch on **Turn pages with the keyboard** has the focus ring. Press **Escape**: the ring moves from the switch to its row, and the page stays open. Press **Escape** again: the Orbis Reader page, with the ring back on **Reading behavior**, not at the top.

- [ ] `desktop` In the settings search box, type **pages with the keyboard**: **Turn pages with the keyboard** is listed under **Orbis Reader** and **Reading behavior**. Select it: **Reading behavior** opens with that row highlighted.

- [ ] `desktop` Search for **Wikipedia**: nothing from Orbis Reader, although it is one of Look-up's web destinations. What a page lists of its own — destinations, feeds, dashboards, voices — is found by going to the page.

---
## Developer options

- [ ] `once` With developer options on, type **(dev)** in the palette: commands including **Factory reset — back to a new install (dev)**, **Reset the welcome (dev)** and **Sync status (dev)**. **Recalculate locations (dev)** is there only while a book is open.

- [ ] `once` In a new, empty vault with this release installed through BRAT, run **Toggle developer options**, then **Download test fixtures (dev)**: **Copy test fixtures?**, *From release* and the installed version, *New files:* and the number of files in the repository's `test-vault/fixtures`, *Changed files: 0.* Select **Copy**: *Copied* that number *test fixtures into fixtures.* The vault's `fixtures` folder now matches `test-vault/fixtures`, with `library`, `notes-to-epub`, `resilience` and `sync` inside it.

- [ ] `once` Run **Download test fixtures (dev)** again: *The test fixtures are already up to date.* Add a line to a note in `fixtures/library` and run it again: *New files: 0. Changed files: 1.* Select **Copy**: *Copied 1 test fixture into fixtures.*, and the line is gone. Delete the vault.

- [ ] `once` In `test-vault`, with a build from `deploy.sh` whose version has no published release, run **Download test fixtures (dev)**: *No test fixtures are published for version* and the version, *A release must be published first.* Nothing in `fixtures` changes.

- [ ] `once` Run **Toggle developer options**: *Orbis Reader developer options are off.* Typing **(dev)** finds nothing from Orbis Reader. Run it again to turn them back on: it is a setting for this device, so another device still has them as it did.

---
## The command palette

- [ ] `once` With a Markdown note open and no book, type **Orbis Reader:** in the palette. It lists **About Orbis Reader**, **Manage annotation presets…**, **Read in Orbis Reader**, **Save note as EPUB…**, **Show pronunciation glossary…**, **Toggle debug button**, **Toggle developer options** and **Toggle link preview** — and not **Next page**, **Go to location**, **Open book** or **Switch display style**, which need a book. With the Library on, **Open the library** too, and **Mark this note as a title note** when the note has a `title` property and no `kind`; with book sources on, **Browse book sources**.

- [ ] `once` Open `annotation-workhorse.epub` and do the same: **Go to next page**, **Go to location**, **Toggle focus mode**, **Open book** and **Switch display style** are there now, and **Read in Orbis Reader** is not. Open a note in a split beside the book and put the cursor in it: **Switch display style** is still listed, and choosing a style changes the book.

- [ ] `desktop` In **Settings → Hotkeys**, search for **Orbis Reader**: every command is listed. Select **Assigned**, then **Assigned by me**: both list the same Orbis Reader commands. A command under **Assigned** alone would have a default hotkey from Orbis Reader, and Orbis Reader sets none. `commands-hotkeys.test.ts` checks the same in code.

- [ ] `each` With no book open, run **About Orbis Reader**: **About Orbis Reader**, with **Version** (the same as the Settings page's), **Build** (a date and time) and **Commit**, and **Copy** and **Close**. Select **Copy**: *Build info copied to clipboard*. Pasted into a note, it is three lines, **Version:**, **Build:** and **Commit:**. Select **Close**.

- [ ] `once` In a book, run **Open book**: the same book opens again in a second pane beside it. Close that pane.

- [ ] `once` Run **Toggle link preview**, then open **Settings → Reading behavior**: **Link preview** is off. In `fixtures/footnotes.epub`, selecting a footnote marker goes straight to the note. Run the command again: **Link preview** is on, and the marker shows its preview.

- [ ] `once` In a book, run **Toggle debug button**: the debug log's button appears in the book (on the Mac its tooltip is **Toggle debug log**). Run it again: it goes.

- [ ] `once` In a book, run **Copy link to current location**: *Link copied to clipboard*. Paste it into a note: the book's name, linked. Select the link: the book opens at that page.

- [ ] `once` In a book with no passage selections, notes or bookmarks, run **Copy passage selections to clipboard**, **Copy notes to clipboard** and **Copy bookmarks to clipboard**: *No passage selections*, *No notes* and *No bookmarks*. Make one of each, run the three again — *Passage selections copied to clipboard*, *Notes copied to clipboard*, *Bookmarks copied to clipboard* — and paste each: a heading naming the chapter, then the item with a link to where it is.

- [ ] `once` In a book, go to another chapter from the **Contents** tab. Run **Go back**: the page you came from. **Go forward**: the chapter again. **Clear navigation history**: *Navigation history cleared*, and the back and forward buttons go. Run it again: *No navigation history to clear*.

---
## Clean up

- [ ] `once` Delete the notes the pasted links and copies went into, and the marks made for the copy commands. In `test-vault`, leave developer options on; the factory reset left it a new install, which the next run starts from anyway.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
