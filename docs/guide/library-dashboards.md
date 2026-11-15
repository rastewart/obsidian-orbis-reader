# Library Dashboards

← [User Guide](README.md)

---

## Overview

Library dashboards shows the titles and reading records in your vault on dashboards that you design. Each title and reading record is an Obsidian note. A title note can be an ebook in the vault, a printed book or any other item that you want to track.

If you only want to read a few books, you do not need to enable the library.

---

## Enable the library

1. Go to **Settings → Orbis Reader → Library dashboards**.
2. Enable **Enable the library**.
3. In the **Enable the library** dialog, in **Where should title notes go?**, select a folder.
4. Optional: Enable **Save cover images**, and select a **Covers folder**.
5. Select **Enable**.

You can also enable the library from the **Library dashboards** item on the **Setup** page.

Each cover image is about 40 KB. If you cancel the dialog, the library stays disabled.

If your vault has books or notes to review, the catalog review opens next. See [Catalog the books in your vault](#catalog-the-books-in-your-vault).

---

## Open the library

In the ribbon, select **Open the library**. You can also run **Open the library** from the command palette. On a phone, the command palette is the quicker way.

The Library view opens and shows the current dashboard.

---

## How the library is organized

The library is made of these parts:

- A **title note** describes one title. A reading record describes one annotation.
- A **collection** contains the notes that match its filters.
- A **widget** shows one collection in a specific way.
- A **dashboard** is a set of widgets.

---

## Catalog the books in your vault

Use the catalog review to make title notes for many books at the same time. A book that has no title note does not show in the library.

1. Open the catalog review. Do one of these:
   - In the notice at the top of the dashboard, select **Review**.
   - Go to **Settings → Orbis Reader → Library dashboards**. In **Library status**, select **Review**.
2. If the dialog shows **Potential title notes missing a property**, update those notes first. See [Update notes that are missing a property](#update-notes-that-are-missing-a-property).
3. Next to **Uncataloged books**, select **Review**.
4. Optional: Change the **Folder for new title notes**, or enable or disable **Save cover images**.
5. In **Uncataloged books**, check each book that you want to catalog.
6. In **Books that may already have a title note**, check each book that you want to catalog.
7. For each book that you checked in **Books that may already have a title note**, select **Attach** or **New note**.
8. Select the button at the bottom of the dialog, such as **Catalog 12**.

No book is checked when the dialog opens. To check all the books in a group, select **Select all**.

In **Books that may already have a title note**, each row shows the title note that the book may match, and the reason. **Attach** adds the book file to that title note, and is selected by default. **New note** makes a new title note for the book.

For what a title note contains, see [Title notes](#title-notes). For where cataloging takes its values, see [What cataloging writes](#what-cataloging-writes).

---

## Update notes that are missing a property

Some notes have title note properties but do not have `orbis_note: title`. The library does not show these notes. Books that these notes link to are counted as uncataloged.

1. Open the catalog review. See [Catalog the books in your vault](#catalog-the-books-in-your-vault).
2. Next to **Potential title notes missing a property**, select **Update**.
3. Check each note that describes a title.
4. Select the button at the bottom of the dialog, such as **Update 4**.
5. Optional: To catalog your books next, select **Review the books again**.

Updating a note adds `orbis_note: title` to it. The library then shows it.

For the properties of a title note, see [Title notes](#title-notes).

---

## Catalog one book

1. Open the book, or find it in the Files pane.
2. In the reader's **⋯** menu, or in the book's context menu in the Files pane, select **Catalog this book**.

You can also run **Catalog this book** from the command palette.

Orbis Reader writes the title note in the **Folder for new title notes**. If **Save cover images** is enabled, it also saves the cover. A notice shows **Cataloged** and the title.

If the book looks like a title that already has a title note, the catalog review opens for that book first. In the review, select **Attach** to add the book file to that title note, or **New note** to make a new one. Then select the button at the bottom of the dialog.

After the book has a title note, the menu item changes to **Open title note**.

For where cataloging takes its values, see [What cataloging writes](#what-cataloging-writes). For how the cover is saved, see [Covers](#covers).

---

## Make an existing note a title note

1. Open the note.
2. Run **Mark this note as a title note** from the command palette.

The command is available when the note has a `title` property and no `orbis_note` property.

For the properties of a title note, see [Title notes](#title-notes).

---

## Change the cover of a book

1. Open the book.
2. Run one of these commands from the command palette:
   - **Take the cover from this book again**: saves the cover from the book file again.
   - **Replace the cover with a generated one**: makes a cover with the title and the first author on a colored background.

The commands are available when the book has a title note.

For where covers are stored, see [Covers](#covers).

---

## Title notes

A title note is a note with the property `orbis_note: title` and a `title` property. All other properties are optional.

```yaml
---
orbis_note: title
title: "Sample Book: A Subtitle"
authors: ["Tester, Orbis"]
series: ""
publisher: "Sample Press"
publication_date: "2026-01-15"
language: en
tags: [fiction, adventure]
rating:
reading_status: ""
cover: "[[covers/sample-book.jpg]]"
files: ["[[epub/Sample Book.epub]]"]
added: 2026-05-03
---
```

The `files` property lists the book files of the title. It is optional, so a title does not need a book file. One title can have several files. For example, an EPUB and a MOBI of the same book are two files on one title note.

A value can be a link. If you keep a note for each author, write `authors: ["[[people/John Doe]]"]`. The library shows the display name of the linked note, not its path. This also works for `series`, `publisher` and `subjects`.

Title notes are Obsidian notes. They show in search, graph view, Properties, bases and hover previews, and you can link to them from other notes. If you disable the library or Orbis Reader, your title notes stay in the vault.

Because the library uses notes, it can describe all your books when some book files are not on a device.

---

## What cataloging writes

Cataloging takes the values for a title note from the book's own metadata, such as the title, author, publisher, date and language.

If the book's metadata has no title, Orbis Reader uses the file name as the title. Orbis Reader does not take an author from a file name.

---

## Covers

A cover is an image file in your vault. The `cover` property of the title note links to it. Covers show in Properties and in bases, in addition to the library.

Orbis Reader saves the cover from the book. If the book has no cover, Orbis Reader makes a cover with the title and the author.

When you catalog one book, the **Save cover images** setting controls whether its cover is saved. The catalog review has its own **Save cover images** switch for that review.

---

## Reading status and rating

The reading status and the rating are the values you set for a title. Collections often filter on them.

| Value | Property | Values |
|---|---|---|
| **Reading status** | `reading_status` | `interested`, `reading`, `read`, `abandoned`, and any value that you add |
| **Rating** | `rating` | 0 to 5, in steps of a half. Zero is a rating, and is not the same as no rating |

To put a book aside, set its status to `abandoned`, or to a status that you added, such as `archived`. Collections, groups and widgets can all use the status. For example, a **Recently opened** widget can use a collection that leaves out `abandoned` titles.

The library shows a reading status as the value that the title note stores, such as `abandoned`. To show a different name, see [Change the name that a value shows](#change-the-name-that-a-value-shows). To add a status, see [Add a new reading status](#add-a-new-reading-status).

When you set the status to `read`, Orbis Reader also adds today's date to `date_read`, if the note has no `date_read`. To find the books that you finished this year, make a collection with the condition `date_read` **is in** **this year**.

---

## Set the reading status or rating of the book you are reading

1. In the reader's **⋯** menu, select **Set reading status** or **Rate this book**.
2. Select a value.

The dialog shows a check mark beside the current value. You can also run **Set reading status** or **Rate this book** from the command palette.

You do not have to catalog the book first. If the book has no title note, Orbis Reader makes one and then sets the value. The notice shows both changes.

If the book looks like a title that already has a title note, the catalog review opens first. See [Catalog one book](#catalog-one-book).

---

## Set the reading status or rating from a dashboard

1. Select the **⋯** button of the title. It is at the end of a list row, or in the corner of a cover.
2. Select **Reading status** or **Rating**.
3. Select a value.

You can also right-click or long-press the row or the cover to open the same menu. From the keyboard, press Tab to move to the title, press Tab again to move to its **⋯** button, then press Enter or Space.

The menu shows the current value of the title, such as **Rating: 4/5** or **Reading status: read**. When the title has no value, the menu shows **Rating** or **Reading status**. The second menu shows a check mark beside the current value.

After you set a value, the title may move to another group, or leave the widget if it no longer matches the collection. This happens when a widget shows that property, or when a collection filters, groups or sorts by it. For example, the **Random title** widget skips titles with a reading status, by default. When you set a reading status for the title that it shows, the title leaves the widget.

---

## Clear a reading status or rating

Select the value that the title already has. This works in the reader and on a dashboard.

A cleared reading status has no value. To find the titles that have no reading status, use the condition `reading_status` **has no value**.

---

## Add a new reading status

1. Go to **Settings → Orbis Reader → Library dashboards → Properties**.
2. Select `reading_status`.
3. Select the **Values** tab.
4. Select **Add a value**.
5. In **Value**, enter the new status, such as `archived`.
6. Select **Save**.
7. In the **Edit property** dialog, select **Save**.

The new status shows in the **Set reading status** dialog and in the **⋯** menu on dashboards.

---

## Properties

The **Properties** page matches the library's properties to the properties in your notes. It is in **Settings → Orbis Reader → Library dashboards → Properties**.

The page lists **Title note properties**, **Reading record properties** and **Custom properties**. For each property, you can set:

- A **Column heading** for table columns.
- **Aliases**: other property names that mean the same thing in your notes.
- A **Display name** and a position for each value.

The column heading names the property's column in a table widget. Without one, a library property uses its own heading, so `publication_date` shows as *Published*, and any other property shows its name written out, so `use_count` shows as *Use count*. The heading changes only the table: your notes, the property pickers and your collections keep using the property's name.

A value shows as the value in your notes until you give it a display name. Your notes keep their own values, and the library shows your names.

### Change the name that a value shows

This example shows the reading status `abandoned` as *Lost interest*.

1. Go to **Settings → Orbis Reader → Library dashboards → Properties**.
2. Select `reading_status`.
3. Select the **Values** tab.
4. Select **abandoned**.
5. In **Display name**, enter `Lost interest`.
6. Select **Save**.
7. In the **Edit property** dialog, select **Save**.

The value's row shows **Display name: Lost interest**. The **Values** tab lists each value as your notes store it, with the number of titles that use it.

Every place that shows the status now shows *Lost interest*. This includes the **Set reading status** dialog, the **⋯** menu on a dashboard, a column in a table and the groups in a **Summary** widget.

The title note still stores `abandoned`, and a collection condition still matches `abandoned`. Your existing collections continue to work.

On the **Values** tab, you can also put the values in the order that groups use. For a value that Orbis Reader provides, disable **Offer this value** to remove it from menus and pickers. Notes that use the value do not change.

### Add an alias

Use an alias when your notes use a different property name for a library property. For example, your notes can use `writer` for the author.

1. Go to **Settings → Orbis Reader → Library dashboards → Properties**.
2. Select `authors`.
3. In the **Add an alias** dropdown, select `writer`.
4. Select **Save**.

The library then reads `writer` as `authors`. The library looks for the property first, then for each alias in the listed order. It uses the first value that it finds.

The dropdown lists the property names that your notes already use.

### Add a custom property

Any property in your notes can be a column, a group or a condition. Add a custom property to give it aliases, value names or a column heading.

1. Go to **Settings → Orbis Reader → Library dashboards → Properties**.
2. Under **Custom properties**, select **Add a property**.
3. In **Property**, enter the property name, or select a name that your notes already use.
4. Optional: In **Column heading**, enter the heading for a table column.
5. Select **Save**.

For example, store `tbr` in your notes and give it the display name *To be read*.

---

## Collections

A collection is a named set of titles, selected by filters. Every widget uses a collection. Orbis Reader provides the collection **All titles**, which contains every title in the vault.

A collection has two tabs:

- **Filters**: conditions on the properties of your notes. Select **Match all of** or **Match any of**. To add another set of conditions, select **Add another filter**.
- **Group by and sort**: how the matching titles show. You can group by author, series, rating, tag, folder, first letter of the title, or a date property.

You can group a date property by year, quarter, month, week, day, month of the year, decade or how long ago.

The conditions that you can use depend on the type of property:

- Text: **is**, **is not**, **contains**.
- Numbers: **is more than**, **is at least**.
- Dates: **is in the last** a number of days, **is in** a period such as **this month**, **is before**, **is on this date, any year**.

**Match all of** makes a set smaller: a title must match every condition. **Match any of** makes a set larger: a title must match one condition. A collection with no conditions contains every title.

### Property names in collections

**Look at**, **Group by** and **Sort by** show properties by their names in your notes, such as `reading_status` and `date_read`. These are the names that Obsidian's Properties also shows. Other options have their own names, such as **Folder**, **Tag**, **First letter of title**, **First letter of author surname** and **Last opened**.

In **Look at**, **Properties the library reads** lists the library's own properties. **Other properties in your notes** lists the other properties that your title notes have.

A condition matches the value that the note stores. The **Value** dropdown lists `interested`, `reading`, `read` and `abandoned` for the reading status. If a value has a display name, the dropdown shows the display name beside the stored value. The condition still matches the stored value.

### Make a collection

This example makes a collection of the books that you flagged to read next.

1. Go to **Settings → Orbis Reader → Library dashboards → Dashboards and collections**.
2. Under **Title note collections**, select **Add a title note collection**.
3. In **Name**, enter `Next up`.
4. On the **Filters** tab, select **Add a condition**.
5. Set **Look at** to `reading_status`, **Condition** to **is** and **Value** to `interested`.
6. Select **Save**.
7. On the **Group by and sort** tab, set **Group by** to `authors` and **Sort by** to `title`.
8. Select **Save**.

The condition dialog shows how many titles the condition matches. If it shows **Matches nothing**, check the value. An empty result and a wrong value look the same on a dashboard.

### Example collections

You can make these collections for your widgets. Orbis Reader does not provide them.

| Collection | Conditions | Group by |
|---|---|---|
| Next up | `reading_status` **is** `interested` | `authors` |
| Reading now | `reading_status` **is** `reading` | Nothing |
| Finished this year | `date_read` **is in** **this year** | `date_read`, **By month** |
| Series in progress | `series` **has a value**, and `reading_status` **is** `reading` | `series` |
| Never opened | **Last opened** **has no value** | `authors` |
| Best of | `rating` **is at least** 4 | `rating` |
| On this device | `files` **has a value** | `authors` |

---

## Dashboards and widgets

A dashboard is an ordered set of widgets. Each widget shows one collection of titles or reading records in one way.

Orbis Reader provides a dashboard called **Library**. You cannot change it. To make a dashboard that you can change, select **Make a copy**.

You manage dashboards in **Settings → Orbis Reader → Library dashboards → Dashboards and collections**.

| Widget | What it shows |
|---|---|
| **Titles** | Shows every title in the collection, in the groups and order of the collection |
| **Recently opened** | Shows the titles that you opened, most recent first |
| **Recently added** | Shows titles by their `added` date, newest first |
| **Recorded audio** | Shows titles that have a recording, ready to listen offline |
| **Random title** | Shows one title from the collection. **Pick another** shows a different one |
| **Search** | Shows a search box for titles, authors and series in the collection |
| **Summary** | Shows the number of titles in each group of the collection. Select a group to see its titles |
| **Reading records** | Shows reading records. See [Reading records in the library](#reading-records-in-the-library) |

In a widget's settings, you can set how many titles it shows and its view: **List**, **Covers** or **Table**. You can also select the properties shown with each title. **Expanded view** adds a **Show all** button that opens all the titles of the widget full screen.

You select the properties on the widget's **Properties** tab, in the order that they show. In a list, they show under the title. With covers, they show in the tooltip of the cover. In a table, each property is a column. A title that has no value for a property does not show that property.

If you select no properties, a title shows `authors` and `series`, and a reading record shows `book_title` and `chapter`. **Reset properties** goes back to this default.

Dashboards, widgets and collections are shared with your other devices. Which dashboard is **Showing now**, which dashboards are **Disabled**, and their order apply only to the device you set them on. For example, a phone can show a smaller dashboard than a laptop. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

### Add a widget to a dashboard

This example shows the `Next up` collection as covers.

1. Go to **Settings → Orbis Reader → Library dashboards → Dashboards and collections**.
2. Do one of these:
   - To change a copy of the **Library** dashboard, select **Make a copy** next to it. Then select **Show widgets** next to the copy.
   - To start with an empty dashboard, select **Add a dashboard**.
3. Optional: In **Name**, enter a name for the dashboard.
4. Select **Add a widget**.
5. On the **General** tab, set **Collection** to `Next up` and **Shows** to **Titles**.
6. Optional: In **Heading**, enter a heading. If you leave it empty, the widget uses the name of the collection.
7. On the **View** tab, set **View** to **Covers**.
8. Optional: In **How many titles**, enter a number, such as 6.
9. Optional: To add a **Show all** button, set **Expanded view** to a view, such as **Covers**.
10. Optional: On the **Properties** tab, select **Add a property**, then select `series`.
11. Select **Save**.

Changes to a dashboard's name and widget list are saved as you make them.

Open the library. The *Next up* widget shows covers grouped by author. When you set the reading status of a book to `interested`, the book shows in the widget.

You can make other widgets with the same steps. For example, show your finished books grouped by month as a list, or count the titles in each reading status with a **Summary** widget.

---

## Reading records in the library

If [Reading Records](reading-records.md) is enabled, each annotation is also a note in your vault. The library can show these reading records.

**Reading record collections** work the same way as title note collections. Orbis Reader provides the collection **All reading records**. The **Reading records** widget shows a reading record collection.

A **Search** widget that uses a reading record collection searches the passages, your notes and the titles of the books.

Each reading record has three links: **Open the book here**, **Open the book** and **Open the record note**.

---

## Disable the library

1. Go to **Settings → Orbis Reader → Library dashboards**.
2. Disable **Enable the library**.

When the library is disabled, the ribbon button, the **Open the library** command and the other library settings are hidden. An open Library view closes. Your title notes stay in the vault as Obsidian notes.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Library dashboards**. When the library is disabled, only **Enable the library** shows.

| Setting | What it does |
|---|---|
| **Enable the library** | Shows the library, its ribbon button, the **Open the library** command and the other settings on this page. Disabled by default |
| **Folder for new title notes** | Sets the folder where cataloging writes new title notes |
| **Save cover images** | Saves a cover image for each book that you catalog, about 40 KB each. Disabled by default |
| **Covers folder** | Sets the folder for cover images. The default is a `covers` folder in the folder for new title notes |
| **Library status** | Shows how many title notes the library has, and how many notes and books need review. **Review** opens the catalog review |
| **Show a notice when books are uncataloged** | Shows a notice at the top of the dashboard when books have no title note, with a **Review** button. Enabled by default |
| **Dashboards and collections** | Opens the page where you make dashboards, widgets and collections |
| **Properties** | Opens the page where you match library properties to the properties in your notes, and add custom properties |

You can dismiss the notice about uncataloged books. It shows again when you add more books to the vault.

**Show a notice when books are uncataloged** applies only to the device that you set it on. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## Troubleshooting

### A widget is empty

Its collection matches nothing. Open the collection, then open each condition to see how many titles it matches. A condition can look at a property that your notes do not have. It can also match a value that is spelled differently in your notes.

### A book is not in the library

Its note is not a title note. A title note must have `orbis_note: title`. Open the note and run **Mark this note as a title note**. If the book has no note, catalog it. See [Catalog one book](#catalog-one-book).

### A book in your vault is not in the catalog review

A note already links to it. A title note whose `files` property lists the book catalogs that book, even if the note is about a different edition.

### A cover does not show

No image was saved, or the `cover` property links to a file that was moved. **Save cover images** can be disabled. If you move a cover in Obsidian, Obsidian updates the link. If you move it outside Obsidian, the link is not updated.

### A property is not listed for grouping or filtering

A property is listed when at least one title note has it. Check the property name in your title notes. If your notes use a different name for a library property, add your name as an alias. See [Add an alias](#add-an-alias).

### The library is empty and there is no ribbon button

The library is disabled. Go to **Settings → Orbis Reader → Library dashboards** and enable **Enable the library**. You can also use the **Library dashboards** item on the **Setup** page.

---

## See also

- [Reading Records](reading-records.md): describes the annotation notes that the library can also show
- [Reading Progress](reading-progress.md): describes your reading location, reading speed and progress indicator
- [Sync and Devices](sync-and-devices.md#settings-shared-between-devices): describes which library settings are shared with your other devices
- [Reading a Book](reading-a-book.md): describes the **⋯** menu that catalogs, rates and sets a reading status
- [The .orbis File](orbis-file.md): describes the other file where Orbis Reader stores information about a book
- [Settings Reference](settings-reference.md): lists every setting
