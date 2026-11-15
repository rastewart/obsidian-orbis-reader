# Test plan — Marks and notes

← [Design Docs](../README.md)

Marking passages, notes, bookmarks, the **Annotations** tab, and the **Marks manager** with its presets. What a user sees is in the guides: [Marks and notes](../../guide/marks-and-notes.md) and [Annotations and presets](../../guide/annotations-and-presets.md).

**Not here:** the reading-record note an annotation writes ([Reading records](../../guide/reading-records.md)), marks from the audio player ([Listening](../../guide/listening.md)), and a preset reaching another device ([Sync and devices](../../guide/sync-and-devices.md)). Each belongs to its own page.

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

- [ ] `once` Open `annotation-workhorse.epub` from `test-vault/fixtures/`. If `fixtures/!orbis-data/annotation-workhorse.epub.orbis` exists from an earlier run, delete it first, so the book starts with no marks, notes or bookmarks. On a device synced from the Mac, check the file has gone there too.

- [ ] `once` In **Settings → Hotkeys**, give **Apply mark 1**, **Select sentence** and **Extend selection by a sentence** a key each. The keyboard steps use them.

- [ ] `once` Presets start as shipped: **Orbis marks** is the only preset, and it is the default. Remove any preset left by an earlier run from the **Presets** scope of the **Marks manager**.

---
## Marking a passage

- [ ] `desktop` Select a passage by dragging. The marks bar appears centered just below the toolbar, not over the selection. It shows five mark chips, each previewing its own look on `Aa`, then **All marks**, **Add note**, **Look up**, **Copy text** and **Copy link to selection**. Nothing is clipped at the edge of the window.

- [ ] `mobile` Long-press to select a passage. The marks bar appears at the top of the reader, and the selection handles appear and stay: they do not flash and vanish, and they do not wait for a tap to show.

- [ ] `phone` The marks bar shows three mark chips.

- [ ] `ipad` The marks bar shows five mark chips, and nothing of it is cut off at the top of the screen.

- [ ] `mobile` Drag a selection handle up and down. The page stays put while the selection grows and shrinks.

- [ ] `each` Select a mark. The passage is painted at once and the bar closes.

- [ ] `once` In two other chapters, mark one passage **Key point** and one **Quote**. Each shows its own mark's look. The preset steps below rely on these two.

- [ ] `each` Select across the edge of a passage you have already marked. The bar offers only **Look up** and **Copy link to selection**: a second mark cannot be stacked on the first.

- [ ] `desktop` With the bar up, hover each button and chip. Every one shows a tooltip within about a second, including **Add note**.

- [ ] `desktop` With the bar up, press Tab repeatedly. Focus moves around the bar's buttons and never leaves it. Press Escape. The bar closes, the selection clears, and the arrow keys turn pages again.

- [ ] `each` Select **All marks**. Every mark in the book's preset is listed, and **Manage marks** is there.

- [ ] `android` Select a word on the top line of the page. Android's own Copy / Select all toolbar may cover the marks bar: this is a known limitation, not a regression. Enlarging the selection, or dragging Android's toolbar down, still uncovers it, and so does touching the page just above Android's toolbar, which dismisses the toolbar and keeps the selection — as [Troubleshooting](../../guide/troubleshooting.md) says.

### The heading a mark is filed under

- [ ] `once` Find a page where a contents entry's heading starts partway down, below the end of the previous section. Mark a passage above the heading, write a note on another passage above it, and choose the bookmark button with the previous section's text at the top of the page. On the **Annotations** tab, and in **Generate notes**, all three are under the previous section's heading, not under the heading lower on the page.

- [ ] `once` Mark a passage below that heading. It is under that heading.

### Changing and removing a mark

- [ ] `each` Select a marked passage. The bar returns with that passage's mark chosen, and a trash icon, **Remove passage selection**, at its right end.

- [ ] `once` Choose a different mark. The passage takes the new look.

- [ ] `once` Select the passage again and choose the trash icon. The mark is removed, and the text is plain.

- [ ] `mobile` Swipe to turn the page, lifting your finger over a passage selection, then over a note's passage — try short, quick flicks as well as long swipes. The page turns, and neither the marks bar nor the note view opens. Tap the same passages: the marks bar and the note view open.

### The bar's other buttons

- [ ] `once` Select a passage and choose **Copy text**. Paste into a note: the passage's text arrives.

- [ ] `once` Choose **Copy link to selection** and paste the link into a note. Close the book, then select the link. The book opens at that passage.

- [ ] `once` Choose **Look up**. The Look-up dialog opens on the selected text. What it finds is tested in the Look-up plan.

### In Focus mode

- [ ] `desktop` Enter Focus mode and select a passage. The bar appears at the top of the book, below Obsidian's view header. With a sepia or dark reader theme it takes the book's colors, its icons sit flat on its background, and the mark chips keep their own colors.

- [ ] `mobile` Enter Focus mode and select a word on the top line. The marks bar appears at the **bottom**, over the progress indicator, not over the selection. Mark it, change its mark, and remove it: all three work.

---
## Notes

- [ ] `each` Select a passage and choose **Add note**. The note editor opens. Its row of marks has **Unmarked** (the **×**) at its left, and the book's default note mark is chosen.

- [ ] `mobile` With the editor open, the on-screen keyboard covers neither the text field nor the Save button. Type a few lines: the field scrolls to keep the cursor in view.

- [ ] `ipad` The insertion point is visible in the editor's text field.

- [ ] `each` Type a note and save. With note icons turned on (**Toggle note icons** on the toolbar), a note icon appears at the right edge of the text, level with the passage's first line.

- [ ] `desktop` Turn on two-column layout, and write a note in each column. The left column's icon sits in the gap between the columns, and the right column's at the right edge of the text: both the same distance from their text, neither over it. Select each icon: its note opens.

- [ ] `once` Write a second note in another chapter, and choose **Unmarked** for it. The passage has no mark in the text, and its note icon still shows.

- [ ] `each` Select a note icon. The note opens to read, not to edit. Choose the edit icon, change the text, and save. The icon's note has the new text.

- [ ] `once` Turn a few pages away and come back. The note icons are beside their passages, not drifted.

- [ ] `each` Choose **Toggle note icons** on the toolbar. The icons go, and on a phone the text widens into the margin they used. Toggle again and they return. The notes themselves are never hidden.

- [ ] `once` Open a note and delete it. Orbis Reader asks first. Turn off **Settings → Reading behavior → Confirm before deleting notes**, delete the other note: it goes without asking. Turn the setting back on.

- [ ] `desktop` Move the book into a window of its own: drag its tab out of the main window, or choose **Move to new window** from the tab's menu. In that window, select a passage: the marks bar appears centered just below the toolbar of that window, not in the main window, and nothing is clipped. Choose **Add note**: the note editor opens in that window. Save it: its note icon sits beside the passage. Turn a few pages away and back: the icons are still beside their passages. Select the main window, then the book's window by its title bar, then the **⋯** at the top right of the book: its menu opens under that **⋯**, in the book's window, not in the main window. Close the window's tab and reopen the book in the main window.

---
## Bookmarks

- [ ] `each` At a page with no bookmark, choose the bookmark button on the toolbar. It fills, and its tooltip reads **Remove bookmark**.

- [ ] `once` Go to another chapter and run **Toggle bookmark on current location** from the command palette. The button fills there too.

- [ ] `once` Go back to the first bookmark's page and choose the button again. It empties, its tooltip reads **Bookmark this location**, and that bookmark has gone from the **Annotations** tab.

---
## The Annotations tab

- [ ] `once` Run **Open Annotations tab**. It lists **Bookmarks**, **Passage selections** and **Notes** in reading order, each entry with its location. A heading with nothing under it says **None yet**.

- [ ] `each` On the **Annotations** tab, select an entry of each kind. The book goes to it and the spot flashes briefly. A chapter chosen on the **Contents** tab goes there without a flash: flashing is for bookmarks, marks, notes, search results and links.

- [ ] `once` Turn off **Settings → Reading behavior → Flash book text for navigation and search results**, and select an entry again. The book goes there without a flash. Turn the setting back on.

---
## From the keyboard

- [ ] `desktop` Press the **Select sentence** key. The sentence at the reading location is selected and the bar appears. Press **Extend selection by a sentence**: the next sentence joins it. Press **Apply mark 1**: the selection takes the first mark on the bar.

- [ ] `desktop` Run **Go to next mark or note** and **Go to previous mark or note** from the palette. The book steps through the marks and notes in reading order.

- [ ] `desktop` Step to a mark and run **Delete the selected mark or note**. That mark is removed and no other.

- [ ] `desktop` Select nothing and run **Delete the selected mark or note**. Nothing is deleted, and a notice says to select a mark or note first.

- [ ] `desktop` Mark a passage, then select it so its marks bar opens. Press **Delete**: the passage selection is removed, with no question. Mark another, select it, and press **Backspace** (the Mac's **delete** key): the same.

- [ ] `desktop` Select some text that is not marked, so the marks bar opens on a new selection. Press **Delete** and **Backspace**: nothing is deleted, and the selection stays.

- [ ] `desktop` With **Confirm before deleting notes** on, open a note in the note view and press **Delete**: **Delete note** asks first. Select **Cancel**: the note stays. Turn the setting off, open the note again and press **Backspace**: the note is deleted at once. Turn the setting back on.

- [ ] `desktop` Open a note in the note editor and press **Backspace** in its text: a character goes, and the note stays.

---
## Copying to the clipboard

- [ ] `once` Run **Copy passage selections to clipboard**, **Copy notes to clipboard** and **Copy bookmarks to clipboard**, pasting into a note after each. Each paste lists what the **Annotations** tab lists under that heading.

---
## Other formats

- [ ] `once` In `annotation-workhorse.mobi` and `fb2-sample.fb2`, mark a passage and write a note. Close the book, reopen it, and turn to them. Both are where you left them, on the same text.

---
## The Marks manager

These steps use a preset of their own, **Test marks**, and remove it at the end.

- [ ] `each` Choose **Annotation marks** on the toolbar. The **Marks manager** opens on **This book**, listing the five marks of **Orbis marks**, each badged **Preset**. On a phone the dialog fills the screen and its buttons stay visible.

- [ ] `once` The dialog also opens from **All marks** → **Manage marks**, from **Annotation marks for this book…** and **Manage annotation presets…** in the palette (the second on **Presets**), and from **Settings → Annotations → Manage annotation presets**.

### Presets

- [ ] `once` On **Presets**, open **Orbis marks** and try to change a mark. It says **The preset Orbis marks can't be edited. Duplicate it to make changes.**

- [ ] `once` Choose **Duplicate**, then **Rename** the copy **Test marks**. In it, rename **Key point** to **Main idea**, and give **Question** a Teal Box.

- [ ] `ipad` In **Duplicate preset**, select the name field. The dialog sits near the top of the screen, the field shows a blinking insertion point, and **Cancel** and **Save** are above the on-screen keyboard. Rotate the iPad: all three stay above the keyboard and the insertion point still shows. The same in **Rename preset**.

- [ ] `phone` In **Rename preset**, select the name field. The field, **Cancel** and **Save** are all above the on-screen keyboard, and on the iPhone the field shows a blinking insertion point.

- [ ] `once` In **Test marks**, open **Quote**'s highlighter colors. The color each other mark uses cannot be chosen. Leave Quote as it is: the steps below rely on it still matching Quote in **Orbis marks**.

- [ ] `once` **Deactivate** is not offered for **Orbis marks**, nor for whichever preset is the default.

### This book

- [ ] `once` On **This book**, open **Quote** and choose **Copy to this book**. The copy replaces it in the list, badged **This book**: the preset's Quote is no longer listed, and a passage marked Quote keeps its look.

- [ ] `once` Change the copy's highlighter to Red, then back to its original purple. Both changes are accepted.

- [ ] `once` Turn **Definition**'s **Active** switch off. It leaves the marks bar in this book only: open `First-Open.epub` and it is still on the bar there. Turn it back on.

- [ ] `once` The trash is disabled for a mark badged **Preset**.

- [ ] `once` Add a mark of the book's own called **Stuff I hate**, a Teal Box — the look **Question** has in **Test marks** — and mark a passage with it.

- [ ] `once` Rename **Stuff I hate** to **quote**. It says **Another mark is already named “quote”. Give this one a different name.**, and the name goes back to **Stuff I hate**.

### Changing the book's preset

- [ ] `once` Choose **Change preset** and pick **Test marks**. Before anything moves, two rows are listed, each with its count and starting at **Keep in this book**: **Key point**, whose line names **Main idea**, and **Stuff I hate**, whose line names **Question** — the same look, under another name. **Quote** has no row: the book's copy matches Test marks' Quote exactly, so the preset's takes its place without asking.

- [ ] `once` Select the dimmed backdrop outside the dialog: it stays open, with the rows as they were. Do the same in the name dialog that **Rename** opens on the Presets tab: it stays open with what you typed. **Cancel** closes each one.

- [ ] `once` Accept the defaults. Every annotation keeps its mark and its look. **Key point** and **Stuff I hate** are badged **This book** and flagged **`*`**, with the line explaining that a preset mark with the same look has not been added.

- [ ] `once` Change **Stuff I hate** to a Brown Underline. **Question** arrives in the book's list with no other step.

- [ ] `once` On **Presets**, rename **Definition** in **Test marks** to **Term**. The book's list follows.

### Stopping and resuming a preset

- [ ] `once` On **This book**, choose **Stop using this preset**. The header reads **This book uses its own marks.**, every mark is badged **This book**, Quote is listed once, and the marks bar is unchanged.

- [ ] `once` Rename **Term** in **Test marks** to **Glossary term**. This book keeps **Term**.

- [ ] `once` Close and reopen the book. It still uses its own marks.

- [ ] `once` Mark a passage with **Question**, the Teal Box.

- [ ] `once` Choose **Use a preset** and pick **Orbis marks**. The same per-mark choice as **Change preset** is offered. **Question**'s row starts on Orbis marks' **Question**, and its line says that choosing **Keep in this book** renames it **Question (this book)**. Choose **Keep in this book** on every row.

- [ ] `once` The list has one **Question**, badged **Preset**, and a **Question (this book)**, the Teal Box, badged **This book**, with the passage still on it.

### Deleting a mark

- [ ] `once` Add a mark of the book's own called **Spare**, with a look no other mark has, and delete it. It goes after one confirmation.

- [ ] `once` Delete **Stuff I hate**, which has a passage on it. Orbis Reader asks for **Apply another mark** or **Delete the passage selections, keep the notes**. Choose **Apply another mark** and pick one: the passage takes that mark's look.

- [ ] `once` Deactivate every mark but one. The last active mark cannot be deactivated or deleted.

### Clean up

- [ ] `once` Make sure the book uses **Orbis marks**, then delete **Test marks** on **Presets**. Close and reopen the book: **Test marks** does not come back. Delete `annotation-workhorse.epub.orbis` if the next run should start clean.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
