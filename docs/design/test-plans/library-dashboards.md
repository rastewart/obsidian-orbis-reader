# Test plan — Library dashboards

← [Design Docs](../README.md)

The Library: turning it on, title notes, cataloging, covers, reading status and rating, dashboards and their widgets, collections, and the Properties page. What a user sees is in the guide: [Library dashboards](../../guide/library-dashboards.md).

**Not here:** reading records as notes, and how dashboards and settings travel between devices beyond the per-device facts below. Each will have a page of its own: Reading records and Sync.

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

- [ ] `once` Copy the `fixtures/library` folder from the repository's `test-vault` into the vault's `fixtures` folder: eight title notes and a `covers` folder. The books they describe are already in `fixtures`. Between them the notes carry every reading status, a rating, both date forms, the older `type` key beside `kind`, and one book held on two notes.

- [ ] `once` In **Settings → Orbis Reader → Library dashboards**, write down what **Folder for new title notes**, **Save cover images**, **Covers folder** and **Show a notice when books are uncataloged** say, so Clean up can put them back.

- [ ] `once` On **Dashboards and collections**, under **Title note collections**, select **Add a title note collection**. Name it **Fixtures**. On **Filters**, select **Add a condition**: **Look at** is already **Folder** and **Condition** **is under**. Choose `fixtures/library` under **Value** and save the condition. The foot of the dialog says **Matches 8 titles right now**. Save.

- [ ] `once` Under **Dashboards**, select **Add a dashboard**. It appears as **New dashboard**, opened, with the cursor in **Name**. Name it **Library test**. Select **Add a widget**: **Collection** **Fixtures**, **Shows** **Titles**, and save. With no **Heading** of its own, the widget is named after its collection: it is listed, and headed on the Library, as **Fixtures**. Every later step that says "the test dashboard" means this dashboard, and "the **Fixtures** widget" means this widget.

---
## Turning it on and off

These run in the repository's `test-vault`, opened as a vault of its own on the Mac. They switch the Library off and clear its folders, which in a synced vault would do the same on every device.

- [ ] `desktop` Run **Toggle developer options** from the command palette, then **Reset library first-run (dev)**. A notice says the Library is reset. The ribbon has no Library icon, and **Open the library** is not in the palette.

- [ ] `desktop` In **Settings → Orbis Reader → Library dashboards**, turn on **Enable the library**. A dialog opens titled **Enable the library**, asking **Where should title notes go?** with `Library/Titles` suggested, and a **Save cover images** switch. Turn the switch on: **Covers folder** appears, its default reading **Default: Library/Titles/covers**. Select **Cancel**: **Enable the library** is off again.

- [ ] `desktop` Turn **Enable the library** on again and select **Enable**. The rows below it appear. Books in the vault have no title notes yet, so the catalog review opens, titled **Titles missing from your library**. Close it.

- [ ] `desktop` Open the Library, then turn **Enable the library** off. The Library tab closes, the ribbon icon goes, **Open the library** leaves the palette, and an open book's **⋯** menu no longer offers **Catalog this book**, **Set reading status…** or **Rate this book…**. Turn it back on: no dialog this time.

---
## Opening the library

- [ ] `each` The ribbon's Library icon is named **Open the library**. Select it: a tab titled **Library** opens. Run **Orbis Reader: Open the library** from the palette with it open: the same tab comes forward, and no second one opens.

- [ ] `each` At the top, a dropdown switches between the dashboards this device offers, and beside it the count says how many titles the vault has, such as **214 titles**. Choose **Library test**: its one widget lists the eight fixture titles.

- [ ] `once` With **Show a notice when books are uncataloged** on, the dashboard opens with **N books in your vault have no title note.** above the widgets, with **Review** and an **✕**. Select **✕**: the line goes. Close the Library and open it again: it stays gone until the set of uncataloged books changes.

---
## The provided dashboard

- [ ] `once` Switch to the **Library** dashboard. Its widgets, in order: **Recently opened titles** as covers, **Search**, **From your collection** with one title and **Pick another**, **Ready to listen** as covers, and **Recently added** as a list.

- [ ] `once` In **Settings → Library dashboards → Dashboards and collections**, the **Library** row says **Provided with Orbis Reader — copy it to make your own**. Open it: it begins **This dashboard is provided with Orbis Reader and is read-only.** Its **Name** cannot be edited, there is no **Add a widget**, and each widget opens with **View widget** into a dialog with only **Close**.

- [ ] `once` Select **Make a copy** on the **Library** row. A notice says **Copy made**, and **Library copy** appears at the bottom of the list. Open it: its widgets can be edited, switched off and deleted. Delete **Library copy**: it asks **Delete dashboard?**, saying the collections its widgets show are not affected.

- [ ] `once` **All titles** under **Title note collections** says **Provided with Orbis Reader — every title in the vault**. It has no pencil and no delete, only **Make a copy**.

---
## Collections

All on **Dashboards and collections**, in the **Fixtures** collection's dialog. A condition is added with **Add a condition** and changed with its pencil, each in a dialog of its own. That dialog's line under the condition counts what the condition matches on its own, across the whole vault. The collection's dialog counts the whole collection at its foot, once the condition is saved.

- [ ] `once` Open **Fixtures** and add a condition: **Look at** `reading_status` — properties are listed by their keys, as the notes write them — **Condition** **is**. **Value** is a dropdown of the statuses your notes hold, starting **Choose a value**; there is nothing to type. Choose **reading**, and the line under it counts every title in the vault with that status. Save the condition. The collection's foot says **Matches 2 titles right now**: FB2 Sample and Parts and Chapters.

- [ ] `once` Select the reading status condition's pencil. Change **Condition** to **contains** and type `zzz`: the line under it says **Matches nothing**. Save it. The collection's foot says **Matches nothing right now — check the value on each condition.** Delete that condition.

- [ ] `once` Add `reading_status` **has no value**: **Value** goes away. Save it. The foot says **Matches 4 titles right now**: First Open, whose status is written but empty, and three notes with no status at all. Delete it.

- [ ] `once` Add `rating` **is at least** `2`, under the **Numbers** heading of **Condition**, and save it. The foot says **Matches 2 titles right now**: FB2 Sample and First Open, both rated 2.5. Delete it.

- [ ] `once` Add `date_read` **is in** **this year**, and save it. The foot says **Matches 1 title right now**: the EPUB note of Annotation Workhorse. Delete it.

- [ ] `once` Add `reading_status` **is** **abandoned**, and save it. With **Match all of**, the foot says **Matches 1 title right now**: Volumes, the one fixture that is both. Change the set to **Match any of**: **Matches 8 titles right now**, every fixture — more if notes outside `fixtures/library` are abandoned too, which the count beside the status condition's row shows. Put it back to **Match all of** and delete the status condition.

- [ ] `once` Select **Add another filter**. The two sets are joined by **or**, and each now has a delete button. In the second set add **Folder** **is under** `fixtures/library` and `reading_status` **is** **abandoned**, and in the first `reading_status` **is** **reading**. The foot says **Matches 3 titles right now**. Delete the second set and the first set's status condition, so **Fixtures** is back to its folder condition.

- [ ] `once` On **Group by and sort**, set **Group by** to `authors` and save. The test dashboard's widget shows two groups: **Orbis Tester** with seven titles, and **No author** with `sample-comic.cbz`.

- [ ] `once` Set **Group by** to `publication_date` with **By year**. The order dropdown below offers **Oldest first**, **Newest first** and the two by size. With **Oldest first**, the groups run 2006, 2011, 2013, 2026, and **No date** last. **Parts and Chapters** is in 2006 twice — one note dated `2006-03-28`, the other just `"2006"` — and **No date** holds the MOBI note of Annotation Workhorse and `sample-comic.cbz`. Choose **Newest first**: 2026 first, and **No date** still last. Change **By year** to **By how long ago**: the order now offers **Newest first** before **Oldest first**. Group by `reading_status` instead: it offers **In the property’s order** and **In the property’s order, reversed**; by `authors`, **A to Z** and **Z to A**.

- [ ] `once` Still grouped by `reading_status`, the **Value names and order** list below runs **interested**, **reading**, **read**, **abandoned**, then **No value**, with nothing beneath the list. Move **interested** down two places: a row appears beneath the list saying **Revert to the property’s order.** beside **Reset order**, and the order dropdown above now offers **In this collection’s order** and **In this collection’s order, reversed**. Select the pencil on **read**, set **Name in this collection** to `Finished`, and save. Select **Reset order**: **interested** is first again, **read** still says **Display name: Finished**, the row beneath the list goes, and the dropdown says **In the property’s order** again — renaming a value is not an order of its own. Clear the name, and set **Group by** back to **Nothing**.

- [ ] `desktop` Under **Sort by**, point at the direction button beside `title`: its tooltip says **A to Z — select to reverse**. Select it: **Z to A — select to reverse**. Change the level's property to `rating`: **Highest first — select to reverse**, since the level is reversed. Change it to `date_read`: **Newest first — select to reverse**. Put the level back to `title`, **A to Z**.

- [ ] `once` Select the trash on **Fixtures** while the test dashboard shows it. Nothing is deleted, and a notice says **Shown on “Library test” — remove that widget first.**

---
## Widgets

Each is added to the test dashboard with **Add a widget**, **Collection** **Fixtures**, and checked on the Library.

- [ ] `once` The widget dialog has **Heading** above three tabs, **General**, **Properties** and **View**. **Heading** is empty, described as **Leave empty to use the heading shown.**, and shows in gray the heading the widget will get: **Fixtures** for **Titles**. Change **Shows** to **Search**: it becomes **Search · Fixtures**. Change **Collection** to **All titles**: just **Search**. Typing replaces it. Put **Collection** back to **Fixtures**. **Shows** offers **Titles**, **Search**, **Recently opened**, **Recently added**, **Recorded audio**, **Random title** and **Summary**, and the line under it changes with the choice.

- [ ] `each` On **Library test**, select the **Fixtures** widget's pencil. On **View**, set **View** to **Covers**, **How many titles** to `3` and **Expanded view** to **Covers**. The widget shows three covers in a row that scrolls sideways, and **Show all** below it. Select it: all eight, as a grid, under the widget's heading with a **Back** button. Select **Back**.

- [ ] `once` In the **Fixtures** widget, set **Expanded view** to **List**: the button reads **List view**, and opens the eight as a list. Set it to **Table**: the button reads **Table view**, and opens them as a table.

- [ ] `once` In the **Fixtures** widget's **Properties** tab, the line at the top says **The properties shown for each title.**, and the list — in a shaded box, with a line between rows — holds `authors` and `series`. Nothing is below **Add a property**. Add `reading_status` and remove `series`: a row appears below **Add a property**, saying **Revert property selections to authors and series.** beside a **Reset properties** button. Set **View** to **List**: each row shows the author and the status. Select **Reset properties**: the list is back to `authors` and `series`, and that row goes.

- [ ] `once` Add a **Search** widget. Its box says **Title, author or series**; empty, it says **Type to search your library.** Type `parts`: the two Parts and Chapters notes. Type `zzz`: **Nothing matches.**

- [ ] `once` Add a **Random title** widget. **Titles shown** offers **Titles with no reading status** and **Any title**, described as **Skip titles that carry any status, including “interested”.** With **Any title**, **Pick another** draws again from the eight.

- [ ] `once` Add a **Summary** widget, after setting **Fixtures** to **Group by** `reading_status`. With no heading it reads **Fixtures by Reading status**, a row per status with a count, and **N categories** beside it. Select **reading**: its two titles, under **Back**. On the dashboard's settings row the widget is named, not blank, and its delete button asks about it by that name. Cancel: the Properties steps use it.

- [ ] `once` Add a **Recently opened** widget. Open **First Open** from the test dashboard and come back: it is first in the widget. Add a **Recently added** widget: the eight, all added `2026-08-13`.

- [ ] `once` Add a **Recorded audio** widget. None of the fixtures has recorded audio: **Nothing in this collection yet.**

- [ ] `once` Switch a widget off with its switch on the dashboard's settings row: it leaves the Library without being deleted. **Move up**, **Move down** and the drag handle reorder the widgets, and the Library follows.

---
## Status and rating from the dashboard

- [ ] `each` On the test dashboard, open the **⋯** of **FB2 Sample** (named **More**). It lists **Read** and **Listen** (and **Reading data** if the book has been opened), **Open title note**, then **Rating: 2.5/5** and **Reading status: reading**.

- [ ] `desktop` Right-click **FB2 Sample**'s row: the same menu. Open **Settings** in a window of its own and leave it focused, then right-click **FB2 Sample** in the Library again: the menu opens beside the pointer in the Library's window, not over Settings.

- [ ] `mobile` Long-press **FB2 Sample**'s row or cover: the same menu.

- [ ] `each` Choose **Reading status: reading**. A second menu headed **Reading status** lists **interested**, **reading**, **read** and **abandoned**, with a tick on **reading**. Choose **abandoned**. Open the menu again: **Reading status: abandoned**. Open the note: `reading_status: abandoned`.

- [ ] `once` Choose **Reading status: abandoned**, then **abandoned** again: the status is cleared. The menu says **Reading status**, and the note's `reading_status` is empty. Set it back to **reading**.

- [ ] `once` Choose **Rating: 2.5/5**: eleven values from 0 to 5 in halves, with a tick on 2.5. Choose **0**: the menu says **Rating: 0/5** — zero is a rating. Choose **2.5** to put it back.

---
## Status and rating from the reader

- [ ] `each` Open **Volumes** (`fixtures/volumes.epub`). In the pane's **⋯** menu choose **Set reading status…**. The dialog is titled **Set reading status**, names the book, and ticks **abandoned**. Choose **read**: a notice says **Reading status set to read**. Its note now has `date_read` set to today's date — the date where you are, even late in the evening.

- [ ] `once` Choose **Rate this book…**: eleven values, none ticked. Choose **4**: **Rated 4 out of 5**. Choose it again and select **4**: **Rating cleared**. Run **Orbis Reader: Set reading status** from the palette: the same dialog.

- [ ] `once` Open `fixtures/endnotes.epub`, which has no title note. Choose **Set reading status…** and **interested**. The notice has two lines: **Cataloged endnotes** and **Reading status set to interested**. The new note is in the folder for new title notes.

---
## Cataloging

- [ ] `once` Open `fixtures/footnotes.epub`, which has no title note. Its **⋯** menu offers **Catalog this book**. Choose it: no dialog — a notice says **Cataloged Footnotes**, and the note is in the folder for new title notes. The **⋯** menu now says **Open title note**, and it opens the note: title and author from the book's own metadata, the book under `files`, today under `added`, and values written as Obsidian writes them — `title: Footnotes`, not `title: "Footnotes"`.

- [ ] `once` In the **Files** pane, duplicate `fixtures/volumes.epub` — it looks like the **Volumes** note, but nothing links to the copy. Open the copy and choose **Catalog this book**: this time the review opens, on that one book, saying **1 book looks like a title note you already have.**, **Note "Volumes"** with the reason it matched, and **Attach** chosen. There is no **Set all rows**, no **Clear all** and no switch on the row, and the button reads **Attach**. Select it: the dialog closes with **Attached volumes 1.epub to Volumes**, the **Volumes** note now lists the copy under `files` by its full path, `[[fixtures/volumes 1.epub]]`, and no new note is written.

- [ ] `once` Duplicate `fixtures/volumes.epub` again, open the new copy, and choose **Set reading status…** and **read**. The review opens first, as above; choose **New note**, and the button reads **Catalog**. Select it: the dialog closes with **Cataloged Volumes**, and the new note has `reading_status: read`.

- [ ] `once` On the Library, select **Review** on the uncataloged line. The review offers **Uncataloged books** and, when notes look like titles without saying so, **Potential title notes missing a property**. Open **Uncataloged books**: nothing is selected, the button reads **Nothing selected**, and **Select all** selects the group. Cancel.

- [ ] `once` Create a note with only `title: Catalog test` in its frontmatter and run **Orbis Reader: Mark this note as a title note**. A notice says **The library can see this note now.**, and the note has `orbis_note: title`. The command is not offered on a note without a `title`, or on one that already has `orbis_note`.

---
## Covers

- [ ] `once` With **Volumes** open, run **Orbis Reader: Replace the cover with a generated one** from the palette. A notice says **Cover saved to** a path, the note's `cover` points at that image, and the cover on the test dashboard becomes a gradient with **Volumes** at the top left and **Orbis Tester** at the bottom left.

- [ ] `once` Run **Orbis Reader: Take the cover from this book again**: the book's own cover comes back, or, for a book without one, a generated cover.

---
## Properties

All on **Settings → Library dashboards → Properties**.

- [ ] `once` Open **reading_status** and its **Values** tab: **interested**, **reading**, **read** and **abandoned**, in that order, each saying how many titles use it.

- [ ] `each` Open **abandoned**, set **Display name** to `Lost interest`, and save: the row says **Display name: Lost interest**. Set **FB2 Sample** to **abandoned** from the test dashboard: its **⋯** menu says **Reading status: Lost interest**, the reader's **Set reading status** dialog lists **Lost interest**, and the Summary widget's group is **Lost interest**. The note still says `abandoned`.

- [ ] `once` Turn off **Offer this value** on **interested**: it leaves both status menus, and nothing in any note changes. Select **Reset this property** to put the property back, then set **FB2 Sample** back to **reading**.

- [ ] `once` Open **authors**, set **Column heading** to `Writer`, and save. Set the **Fixtures** widget's **View** to **Table**: its column is headed **Writer**. The collection editor's **Look at** and **Group by** still call it `authors`, as the setting's description says. Clear the heading.

---
## Per device

- [ ] `phone` On a phone the ribbon is the menu behind the button at the bottom left. In your synced vault, turn **Enable the library** off — the switch is shared, so it goes off on your other devices too, briefly: **Open the library** leaves that menu at once, with no reload. Turn it back on: it is back, at the end of the menu.

- [ ] `each` **Library test** reached every device: dashboards and their widgets travel. On this device, turn off **Library test**'s switch on **Dashboards and collections**: it leaves this device's dashboard dropdown, and its row says **Disabled**. On another device it is still offered. Turn it back on.

- [ ] `each` Move **Library test** to the top with **Move up**: it is first in this device's dropdown, and another device's order is unchanged. The dashboard showing is remembered per device, and its row says **Showing now**.

---
## Clean up

- [ ] `once` Delete the **Library test** dashboard, then the **Fixtures** collection. Delete the title notes this run wrote — for `endnotes.epub`, `footnotes.epub`, the second `volumes.epub` copy and **Catalog test** — and any covers they saved, and the two copies of `volumes.epub`. Copy `fixtures/library` from the `test-vault` over the vault's copy again, to undo the statuses, ratings, `date_read` and covers this run changed. Put the four Library settings back as you wrote them down. In `test-vault`, run **Toggle developer options** again to turn them off.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
