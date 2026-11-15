# Reading Records

← [User Guide](README.md)

---

## Overview

Reading records writes a vault note for each passage selection, note and bookmark as you annotate a book. Each note shows in Obsidian search, the quick switcher and the graph, and you can link to it like any other note.

Orbis Reader also writes Obsidian bases beside the notes, so you can group, sort and filter your annotations.

---

## Enable reading records

1. Go to **Settings → Orbis Reader → Annotations → Reading records**.
2. In **Write a reading record for each book as you read**, select **On for every book** or **Ask for each book**.
3. If the **Where should reading records go?** dialog opens, select where the notes go.
4. Select **Save**.

The **Where should reading records go?** dialog opens only the first time. If you cancel it, reading records stay off. The other settings on the page show after you select where the notes go.

| Option | Result |
|---|---|
| **Off** | Writes no reading records |
| **On for every book** | Writes reading records for every book |
| **Ask for each book** | Opens the **Reading record settings** dialog the first time you make an annotation in a new book |

With **Ask for each book**, only an annotation of a type that is recorded opens the dialog. For example, if **Bookmarks** is disabled, a bookmark does not open it. If you close the dialog without saving, it opens again in a later session.

For what a reading record contains, see [What a reading record contains](#what-a-reading-record-contains).

---

## Select the annotations to record

Select the annotations to record when you want reading records for only some types of annotation, or for bookmarks, which are not recorded by default.

1. Go to **Settings → Orbis Reader → Annotations → Reading records**.
2. Under **What gets added to the vault**, enable or disable **Passage selections**, **Notes** and **Bookmarks**.

**Bookmarks** is disabled by default.

At least one type of annotation must stay enabled. You cannot disable the last one. To disable it, first enable another one.

---

## Select where reading records go

Select where reading records go to keep the notes for every book in one folder, or to keep each book's notes beside the book.

1. Go to **Settings → Orbis Reader → Annotations → Reading records**.
2. In **Where each book's reading record goes**, select **In one folder for every book** or **Beside each book**.
3. If you selected **In one folder for every book**, select a folder in **Folder for reading records**.
4. Optional: Enable **Create one base covering every book**, then select a folder in **Folder for the base covering every book**.

This sets the default for every book. You can change it for one book. See [Change reading records for one book](#change-reading-records-for-one-book).

The base that covers every book shows the records from all books. Each book also has its own base. **Folder for the base covering every book** shows only when **Create one base covering every book** is enabled.

For the folders that each option makes, see [Where the notes are stored](#where-the-notes-are-stored).

---

## Change reading records for one book

Change reading records for one book when that book needs a different setting, different annotation types or a different folder from the vault setting.

1. Open the book.
2. In the ⋯ menu, select **Reading record settings**.
3. In **Reading record for this book**, select **Follow the vault setting**, **On for this book** or **Off for this book**.
4. Optional: Under **What gets written**, disable **Follow vault settings**, then enable or disable each type of annotation.
5. Optional: Under **Where they go**, select a folder option in **Save to**.
6. Select **Save**.

You can also run **Reading record for this book** from the command palette.

The **Reading record settings** dialog shows the vault setting at the top. Under **Reading record for this book**, it shows the result for this book, such as *Reading record: Active.*

**Save to** has these options:

| Option | Result |
|---|---|
| **Follow vault default — the shared records folder** or **Follow vault default — beside the book** | Uses the vault setting. The option shows which one the vault setting is |
| **The shared records folder** | Puts the notes in **Folder for reading records** |
| **Beside the book** | Puts the notes in a new folder next to the book |
| **A folder you choose** | Shows a **Folder** row, where you select the folder |

The dialog shows the folder that the notes go to. If you change the folder and the book has notes, the dialog shows how many notes move. For example: *Moves 12 existing notes here.* When you select **Save**, the notes move to the new folder.

If you select **Off for this book**, the dialog shows *12 existing notes stay where they are. Nothing is deleted.*

---

## Write reading records for a book you already annotated

Orbis Reader writes reading records as you annotate, so the annotations that you made before you enabled reading records have no records until you do this.

1. Open the book.
2. Run **Write this book's reading record** from the command palette.

A notice shows how many notes were added and updated.

---

## Remove the records of deleted annotations

Remove the records of deleted annotations to move the records that have nothing of yours in them to the trash.

1. Open the book.
2. Run **Remove records of deleted content** from the command palette.
3. In the **Remove records of deleted content** dialog, select the **Remove** button. It shows the number of notes that it removes.

The dialog lists the records of this book whose annotations were deleted. It shows two groups:

- Records that you can remove, because nothing of yours is in them. The **Remove** button moves these to the trash.
- Records that Orbis Reader keeps, because you wrote in them, added properties or linked to them from another note. To remove these, delete them by hand.

For the records that Orbis Reader keeps when you delete an annotation, see [When you delete an annotation](#when-you-delete-an-annotation).

---

## What a reading record contains

Each reading record has a part that Orbis Reader writes, then this line:

```text
<!-- Orbis: everything above is regenerated from the book. Your own notes go below. -->
```

Orbis Reader writes the text above the line again each time it updates the record. It does not change the text below the line. Write your own notes below the line.

The properties of a reading record contain the excerpt, your note text and the mark. They also contain the book title, the author, the chapter, the location, the date that you made the annotation, and the `orphaned` property. The bases use these properties. Every reading record has the tag `orbis-reading-record`.

A bookmark's reading record uses the bookmark's sentence as its excerpt. For a bookmark, this is the sentence at the top of the page when you made it. For an audio bookmark, it is the sentence that was being read.

Orbis Reader writes reading records in the background. No notice shows when it writes a record.

---

## Where the notes are stored

| Setting | Notes | Base for the book |
|---|---|---|
| **In one folder for every book** | In a subfolder for each book, such as `Reading records/content/Sample/` | `Reading records/Sample.base` |
| **Beside each book** | In a new folder next to the book, such as `Sample-reading-records/content/` | `Sample-reading-records/Sample.base` |

If two formats of a book are in the same folder, each format has its own records. The format is added to the name, such as `Sample (EPUB)` and `Sample (AZW3)`.

---

## When you delete an annotation

When you delete a passage selection, note or bookmark, Orbis Reader also deletes its reading record. Orbis Reader keeps the record if any of these is true:

- You wrote below the line.
- You added properties of your own.
- Another note links to the record.

A record that Orbis Reader keeps gets `orphaned: true`. Orbis Reader moves other records to the trash, so you can restore them.

Every record has the `orphaned` property. It is `false` when Orbis Reader writes the record, and `true` when its annotation is deleted. To show only the records whose annotations exist, use the base filter `orphaned != true`.

A record that you keep stays until you delete it. To remove the records that have nothing of yours in them, see [Remove the records of deleted annotations](#remove-the-records-of-deleted-annotations).

If you disable reading records, Orbis Reader does not delete any records. It stops writing new records.

### On more than one device

The `orphaned` property can change back to `false`. If you open a book on a device before its .orbis file arrives from your sync tool, the records have no annotations to match. Orbis Reader then sets `orphaned: true` on all of them. When the .orbis file arrives, Orbis Reader sets them back to `false`.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Annotations → Reading records**.

| Setting | What it does |
|---|---|
| **Write a reading record for each book as you read** | Sets when Orbis Reader writes reading records: **Off**, **On for every book** or **Ask for each book** |
| **Where each book's reading record goes** | Sets the default folder: **In one folder for every book** or **Beside each book** |
| **Folder for reading records** | Sets the folder for every book's notes. Shown only when the notes go in one folder |
| **Create one base covering every book** | Adds one base that shows the records from every book |
| **Folder for the base covering every book** | Sets the folder for that base. Shown only when **Create one base covering every book** is enabled |
| **What gets added to the vault** | Sets which annotations are recorded: **Passage selections**, **Notes** and **Bookmarks** |

These settings are shared with your other devices. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## See also

- [Exporting and Converting with Orbis Reader](exporting-and-converting.md): compares Reading records with the exports
- [Generate Notes](generate-notes.md): writes a book's annotations to notes when you run it
- [Marks and Notes](marks-and-notes.md): describes how to make the annotations that Reading records writes
- [The .orbis File](orbis-file.md): describes the files that Orbis Reader stores for each book
- [Settings Reference](settings-reference.md#reading-records): lists every setting on the **Reading records** page
