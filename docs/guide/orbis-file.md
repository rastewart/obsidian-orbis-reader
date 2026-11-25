# The .orbis File

← [User Guide](README.md)

---

## Overview

Orbis Reader does not change your book files. It stores your annotations and reading stats for each book in a .orbis file, in the `!orbis-data` folder beside the book.

You can open the .orbis file in Obsidian. It shows the book's reading data: the cover, your reading activity, the contents, your annotations and the notes that link to the book.

---

## Open the .orbis file in Obsidian

1. Open the book.
2. In the ⋯ menu, select **Show reading data**.

You can also open the reading data in these ways:

- Run **Show reading data for this book** from the command palette.
- In the Library view, select a title's **⋯** button, then select **Reading data**. This option shows after you open the book for the first time.
- In the Files pane, open the book's `!orbis-data` folder and select the .orbis file.

The first three ways open the reading data beside the book. If the pane is too narrow, such as on an iPad mini in portrait, the reading data opens below the book. On a phone, it opens in a new tab. To go back to the book, use Obsidian's tab switcher. If the reading data is already open, it comes to the front.

The reading data updates each time the .orbis file changes, such as when you add a note or turn a page. You can keep it open beside the book.

For each section of the reading data, see [What the reading data shows](#what-the-reading-data-shows).

---

## Move or rename a book

Move or rename books in Obsidian whenever possible. When you move or rename a book in the Files pane, its data moves with it.

If you move a book outside Obsidian, see [Books moved outside Obsidian](#books-moved-outside-obsidian).

---

## Start a book over

1. In the Files pane, open the book's `!orbis-data` folder.
2. Delete the book's .orbis file.

Delete the file while Obsidian is running. Orbis Reader then clears the book's passage selections, notes and bookmarks on every device that shares the vault. Your reading location stays. You cannot undo this in Orbis Reader.

If you delete the whole `!orbis-data` folder, Orbis Reader does the same for every book in the folder. It also removes your reading location in each book.

Orbis Reader makes the `!orbis-data` folder again at once. For each book that had data, it writes a `<book>.marks.<deviceId>.json` file that records the clear. This file stops another device that still has the old annotations from bringing them back.

For the files in the folder, see [The `!orbis-data` folder](#the-orbis-data-folder).

---

## Remove the `!orbis-data` folder

1. Go to **Settings → Community plugins**.
2. Disable **Orbis Reader**.
3. Delete the `!orbis-data` folder.
4. Enable **Orbis Reader**.

Orbis Reader does not record the clear when you remove the folder this way. If you use the vault on more than one device, another device can bring the annotations back.

For the files in the folder, see [The `!orbis-data` folder](#the-orbis-data-folder).

---

## What the reading data shows

### Header

The header shows the cover, the title, the author and the number of annotations. Below it are your **Average reading speed** and the date you **Last read** the book.

The reading speed shows only after Orbis Reader has eight samples of your reading speed. It takes one sample for each page that you read. It is the same value as **Estimated reading speed** in the Stats tab. See [Reading Progress](reading-progress.md).

### Reading activity

**Reading activity** has one row for each device that opened the book. Each row shows the **Device**, the date it **Last opened** the book, and its **Last location**.

To open the book at a device's last location, select the location. Use this to continue on this device from where another device stopped.

The table shows the data from the reading-location files. A device shows after it opens the book and its file syncs to this device.

### Contents

**Contents** shows the book's table of contents. To open the book at a chapter, select the chapter. A long list scrolls inside the section.

### Bookmarks, Passage selections and Notes

Each section shows the number of items, and you can expand it. The items are in the order that they appear in the book. To go to the place that an item came from, select it.

- **Bookmarks** shows the chapter and the location.
- **Passage selections** shows the mark, the chapter, the location and the passage.
- **Notes** shows the same as **Passage selections**, and your note text.

An empty section shows **None yet.** To make annotations, see [Marks and Notes](marks-and-notes.md).

### Linked vault notes

**Linked vault notes** lists every vault note that links to the book. To open a note, select it. The Navigator in the reader has the same list, in its **Linked vault notes** tab. See [Reading a Book](reading-a-book.md).

The list includes two kinds of links:

- A link to the book file: a wikilink or a Markdown link, anywhere in the note.
- An `obsidian://orbis-nav` deep link to this book. [Generate Notes](generate-notes.md), [Reading Records](reading-records.md) and **Copy link to selection** make these links. See [Deep Links](deep-links.md).

The Library title note is also listed, because it links to the book.

Orbis Reader scans the vault to find deep links. On a large vault, the section shows **Scanning…** for a short time. The scan runs again each time the reading data updates.

The **Linked vault notes** tab scans the vault a few seconds after you open the book. Until the scan is done, it shows **Scanning vault…**. The tab does not update while the book is open. To see a link that you added while you read, close the book and open it again.

---

## What the .orbis file contains

The .orbis file contains your passage selections, notes, bookmarks and reading stats. It also stores details of the book, such as its title, author, cover and table of contents. Your reading location is in a separate file for each device.

Orbis Reader makes the .orbis file the first time you open a book, before you make any annotations. It stores the book's details, and it writes your reading location to this device's reading-location file.

Orbis Reader keeps a .orbis file for every book, whether or not you use Library dashboards or Reading records. Two other features also store information about a book:

- [Library Dashboards](library-dashboards.md) describes the book in a title note, with its author, reading status, rating and dates.
- [Reading Records](reading-records.md), when enabled, writes each annotation to its own vault note.

---

## The `!orbis-data` folder

Orbis Reader stores the .orbis file in a folder named `!orbis-data`, in the same folder as the book. One `!orbis-data` folder contains the files for every book in its folder. The file names show which book each file belongs to.

```text
ebooks/
  Sample Book.epub
  Another Book.epub
  !orbis-data/
    !readme.md                                   ← what this folder is
    Sample Book.epub.orbis                       ← annotations and book details
    Sample Book.epub.location.1xa52jz0qzla.json  ← reading location, one file for each device
    Sample Book.epub.location.tce0313qaamb.json
    Sample Book.epub.marks.1xa52jz0qzla.json     ← one device's changes to annotations
    Sample Book.epub.pages.json                  ← page counts
    Another Book.epub.orbis                      ← the next book's files, in the same folder
    Another Book.epub.location.1xa52jz0qzla.json
    Another Book.epub.pages.json
    audio/
      Sample Book.epub.audio/                    ← recordings, if you recorded this book
```

The `!` at the start of the name puts the folder at the top of the Files pane.

| File | What it contains |
|---|---|
| `!readme.md` | Contains a short description of the folder. Orbis Reader writes it when it makes the folder. If the file is changed or deleted, Orbis Reader writes it again when you open a book's reading data |
| `<book>.orbis` | Contains the passage selections, notes, bookmarks, reading stats and book details, such as the title, author, cover and table of contents |
| `<book>.location.<deviceId>.json` | Contains the reading location, in one file for each device. The device ID in the name lets each device write its own file |
| `<book>.marks.<deviceId>.json` | Contains each change that one device made to the book's annotations, in one file for each device. Orbis Reader builds the .orbis file from all of these files, so two devices keep the changes they made while apart |
| `<book>.pages.json` | Contains the page counts. You can delete it. Orbis Reader makes it again the next time you open the book |
| `<book>.origin.json` | Contains the name of the note that a book came from. Only for a book that [Read in Orbis Reader](read-in-orbis-reader.md) made. Read in Orbis Reader uses it to find the book again |
| `audio/<book>.audio/` | Contains the recordings for one book, in one folder for each voice, with a `manifest.json` file. Only present after you record the book. See [Listening](listening.md) |

`<book>` is the book's full file name, with its extension. For example, `sample.epub` stores its annotations in `sample.epub.orbis`. Two formats of one book in the same folder, such as `sample.epub` and `sample.azw3`, have separate reading locations, annotations and recordings.

---

## Books moved outside Obsidian

If you move a book in Finder, File Explorer or a terminal while Obsidian is running, Obsidian sees a deleted book and a new book. If a book with the same file name and size appears in the vault a few seconds later, Orbis Reader moves its data with it.

If you also renamed the book, Orbis Reader cannot match the two. The book opens without its annotations and reading location, and its old data goes to the trash.

If Obsidian was closed when you moved the book, the data stays in the old `!orbis-data` folder, with the old name.

---

## Deleted books

When you delete a book, Orbis Reader moves its data to the trash. The trash is the place that **Settings → Files and links → Trash → Deleted files** sets. By default, it is the system trash. If you delete a book by mistake, you can restore its data with it.

---

## Reading the .orbis file

The .orbis file is a JSON text file. You can open it in a text editor and read it.

Do not edit the .orbis file. Orbis Reader updates it each time you make an annotation, so it can overwrite your change. An edit can also make an annotation that does not show in the book.

---

## What differs by format

Every format that Orbis Reader opens gets a .orbis file. A CBZ book has no text to select, so it has no passage selections or notes. Its table of contents lists each page by the file name of its image. See [Format Support](format-support.md).

---

## See also

- [Marks and Notes](marks-and-notes.md): describes how to make the annotations that the .orbis file contains
- [Reading Progress](reading-progress.md): describes how Orbis Reader saves your reading location
- [Reading Records](reading-records.md): writes the same annotations as separate vault notes
- [Sync and Devices](sync-and-devices.md): describes how the files in `!orbis-data` work on more than one device
- [Exporting and Converting with Orbis Reader](exporting-and-converting.md): describes how to export annotations as Markdown or PDF
- [Format Support](format-support.md): describes what each format supports
