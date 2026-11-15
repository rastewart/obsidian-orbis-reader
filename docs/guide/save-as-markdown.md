# Save as Markdown

← [User Guide](README.md)

---

## Overview

**Save as Markdown** converts a book's text to Markdown notes in your vault, so you can search the text and link to it.

Your annotations are not included, so a book with annotations gives the same result as a book without them. It works with every format that Orbis Reader opens.

---

## Save a book as Markdown

1. Open the book.
2. In the **⋯** menu, select **Save as Markdown**.
3. In **Format**, select **Book folder** or **Single Obsidian note**.
4. Optional: To change the folder or the name, open **Save to** and change them.
5. Optional: To leave out the images, uncheck **Include images**.
6. Optional: In the **Chapters** list, uncheck the chapters that you do not want.
7. Select **Save**.

You can also run **Save as Markdown** from the command palette.

While the book is saved, the dialog shows the progress of each section and image. When it is done, a notice shows the path of the notes.

For the options in the dialog, see [The dialog](#the-dialog). For what the notes contain, see [What the notes contain](#what-the-notes-contain).

---

## Save the note outside the vault

Save the book as one note outside the vault when you want to read or edit it in another app.

1. Open the book.
2. In the **⋯** menu, select **Save as Markdown**.
3. In **Format**, select **Single Obsidian note**.
4. Optional: Change the name or the chapters, as in [Save a book as Markdown](#save-a-book-as-markdown).
5. Do one of these:
   - On a computer, select **Export…** at the left of the dialog's buttons. In the save dialog, select a folder, then select **Save**.
   - On a phone or tablet, select **Share…** at the left of the dialog's buttons. Then select an app to send the note to.

The note has the name in **File name** under **Save to**. The folder under **Save to** is used only by **Save**.

The note is written to work outside Obsidian:

- A link to a chapter or a heading in the note is a standard Markdown link, such as `[Chapter I](#part-i--chapter-i)`. Most Markdown editors follow these links. Some editors name headings in a different way, so a few links may not work there. **Link format** does not apply.
- A link to a later heading with a repeated name becomes text. Only Obsidian can follow it.
- Footnotes stay footnotes.
- The images are left out, even when **Include images** is checked, because they are separate files.
- The `book` property has the book's file name as text, not a link.

Nothing in the vault changes, so **File already exists** does not apply. On a computer, the save dialog asks before it replaces a file. If you cancel the save dialog, the dialog stays open with your choices kept. A notice shows where the note was saved.

On a phone or tablet, Orbis Reader keeps the note in its plugin folder, in `.obsidian/plugins/orbis-reader/share`, until you share another file or Obsidian starts again. On Android, the first list shows the apps that open a Markdown file. To send the note to a person, select Android Share.

**Book folder** makes a note for each chapter, so **Export…** and **Share…** show only when **Single Obsidian note** is selected. They show only on a device where Obsidian supports them.

---

## Save again over an existing export

If something already exists at the path in **Save to**, the dialog shows **File already exists** or **Folder already exists**.

1. Select one of these options:
   - **Save as new version**: writes a new numbered file or folder beside the existing one. This option is selected by default.
   - **Replace**: overwrites the existing file, or the existing chapter notes in the folder.
2. Select **Save**.

Save as Markdown has no **Merge** option. **Replace** overwrites edits that you made to the existing notes.

---

## The dialog

These sections describe the options in the **Save as Markdown** dialog, in the order of the steps in [Save a book as Markdown](#save-a-book-as-markdown).

### Format and images

**Book folder** writes one note for each chapter into a folder named after the book. **Single Obsidian note** writes every chapter into one note. The default format is set in **Settings → Orbis Reader → Conversions → Save as Markdown → Default format**.

**Include images** is enabled by default. The format sets where the images are saved:

- **Book folder**: in an `assets/` folder inside the book folder.
- **Single Obsidian note**: beside the note, in a folder with the note's name and `-assets` at the end.

**Link format** sets how images and links are written: **Wikilink** (`![[image.jpg]]`) or **Standard Markdown** (`![](image.jpg)`). The default is **Wikilink**. You can change **Link format** only in **Settings → Orbis Reader → Conversions → Save as Markdown**. The dialog does not show it.

### Where the notes are saved

The header of **Save to** shows the folder and the name together. The default folder is set in **Settings → Orbis Reader → Conversions → Save as Markdown → Default folder for Markdown files**. If the folder does not exist, Orbis Reader creates it.

These characters cannot be in a file name: `\ / : * ? " < > | # ^ [ ]`. Orbis Reader changes each one to a space. This applies to names from the book's title and to names that you type. The header of **Save to** shows the name that will be written. A name longer than 120 characters is shortened.

For saving the note outside the vault, see [Save the note outside the vault](#save-the-note-outside-the-vault).

### Chapters

All rows in the **Chapters** list are checked when the dialog opens. The header of the list shows how many rows are checked. To change all rows, select **Select all**, **Clear** or **Invert**.

A chapter is a top-level entry in the book's table of contents. When you check a chapter, the export includes the headings under it. [Generate Notes](generate-notes.md) and [Save as PDF](save-as-pdf.md) use the same definition.

Some top-level entries group chapters, such as a part, one novel of an omnibus, or a title heading over the whole book. These entries open into their chapters: one row for the entry, then one row for each chapter. The entry's row contains the text before its first chapter. In a book folder, if that row contains only a title, the title becomes a heading in the contents note.

A page that contains only a title, and that is not in the book's table of contents, becomes a bold line in the contents note. An example is a page with only *NOTES* on it.

### Sections that are not in the table of contents

Some sections of a book are not in its table of contents. They show in the **Chapters** list with the note **not in contents**.

Orbis Reader names these rows from the section's first heading or its title. Until the name is found, the row shows **Section *n***. The name shows a moment later.

The **not in contents** note shows only when some rows are in the book's table of contents. Some books have no table of contents that Orbis Reader can use. In those books, no row shows the note.

#### Sections that continue a chapter

A section with no name of its own, between two chapters, does not get its own row. Its text goes into the note of the chapter before it. When you check or uncheck that chapter, the section goes with it.

Publishing software often splits a long chapter into several files. The later files contain only the book's title, the chapter's name again, or a name such as *Continued, Sample Book* or *Unknown*. For example, in a novel divided into three books, 48 such files can join the three books instead of becoming 48 notes.

These sections that are not in the table of contents get their own row:

- A section with a real heading.
- A section before the first chapter or after the last chapter.
- A section with only a few words, such as a half-title page.

#### Names that repeat

Some sections that are not in the table of contents have the same name. Each of these names gets the name of the chapter before it as a prefix. For example, in a book where each of eleven chapters ends with a "Summary" section, the sections become *1. Introduction – Summary*, *2. The Basics – Summary*, and so on. Each note, heading and link then names one section. If a prefix does not make every name different, the names stay as they are. An example is two sections with the same name in the same chapter.

In a single Obsidian note, a chapter heading also gets a prefix when the book uses its name as a heading in another place. For example, a chapter named *Configuration* follows a section with a *Configuration* heading. The chapter's heading becomes *4. Servers – Configuration*, so a link to the chapter goes to the correct heading. The row in the dialog still shows *Configuration*.

---

## What the notes contain

These sections describe the notes that Save as Markdown writes.

### Note titles and properties

In a book folder, each chapter note's `title` property has the book's title and the chapter's name, with a colon between them. The title shows which chapter the note is, in search results, link previews and lists from other plugins:

```yaml
title: "Sample Book: PART I – CHAPTER V"
chapter: "PART I – CHAPTER V"
```

`chapter` has the chapter's name only. Two more properties name the book:

- `book`: a link to the book file. Select it to open the book.
- `book_title`: the book's title as plain text. An Obsidian base can group chapter notes by it.

```yaml
book: "[[ebooks/Sample Book.epub]]"
book_title: "Sample Book"
```

Two types of chapter have a different title:

- If a chapter's name already contains the book's title, the `title` is the chapter's name only. For example, a title page named `SAMPLE BOOK` has the title `SAMPLE BOOK`.
- If a chapter has no name, the `title` is the book's title.

The contents note, `000 - {Book Title}.md`, has the book's title as its `title`. A single Obsidian note also has the book's title. Both also have `book` and `book_title`, so an Obsidian base that groups by `book_title` finds every note from an export.

If you convert the folder back into a book with [Notes to EPUB](notes-to-epub.md), each chapter gets the name in its `chapter` property.

### Tables

A table in the book becomes a Markdown table:

- The header row is the book's header row. If the book does not mark one, the header row is empty.
- A cell that spans more than one column or row is written one time, with empty cells where it spanned. The other cells stay in their columns.
- A cell with more than one paragraph keeps them on one line, with line breaks between them.
- A table with only one column becomes paragraphs. Books often use these tables to center a poem or a title.
- A table's caption becomes a paragraph above the table.

### Links

A link in the book stays a link when Obsidian can go to its destination:

- A link to a web page stays a link.
- A link to a chapter becomes a link to the chapter's note in a book folder, or to its heading in a single Obsidian note. For example, the book's contents page links to each chapter: `[[006 - PART I – CHAPTER I|Chapter I]]`.
- A link to a heading inside a chapter becomes a link to that heading, if it is the first heading with that name. Obsidian goes to the first heading with a name. A link to a later heading with the same name becomes text.
- In a single Obsidian note, a link to a later heading with a repeated name goes through its chapter. For example, a link to the third *Hooks* heading in the book becomes `[[#6. Automation#Hooks|Hooks]]`. This link is written only when the chapter's heading appears one time and the target is the first *Hooks* in that chapter.

These links become text:

- A link to a place inside a paragraph. Obsidian can link only to a note, a heading or a block.
- A link to a chapter that you did not export.
- A link inside a heading, such as a chapter title that links to the contents page. The heading stays plain text, so that other links can go to it.

A wikilink shows its text without formatting. For example, an italic title in the book's contents shows without italics. A standard Markdown link keeps the formatting.

**Link format** sets how links are written. For example, `[[006 - PART I – CHAPTER I|Chapter I]]` is a wikilink, and `[Chapter I](006%20-%20PART%20I%20%E2%80%93%20CHAPTER%20I.md)` is standard Markdown.

#### Footnotes and endnotes

A book's footnotes and endnotes become Obsidian footnotes. The number in the text becomes `[^1]`. The note's text is written at the end of the note that refers to it, as `[^1]: …`.

To go to the footnote, select the number. To go back to the text, select the ↩ after the footnote. On a computer, hover over the number to see the footnote.

A link becomes a footnote only when the book shows that it is a note, in one of these ways:

- The note links back to the number.
- The note starts with the same number.
- The book marks it as a note.

Other small numbered links stay ordinary links.

The book's own copy of the notes depends on where the book keeps them:

- Notes at the end of a chapter move into that chapter's footnotes.
- Notes in a separate Notes chapter also stay in that chapter. Each note's number becomes a link back to the paragraph that refers to it. In a single Obsidian note, each note shows two times. It is in the footnote list at the end of the note, and in the book's Notes chapter.

To make these links, Orbis Reader adds a block ID, such as `^fn-1`, to the end of each paragraph that refers to a note. Reading view does not show it. This is the only text that Save as Markdown adds to the book's text.

In a single Obsidian note, chapters that each number their notes from 1 repeat the same labels. A repeated label gets a suffix: the first note of the second chapter is `[^1-2]`. Reading view numbers the footnotes in order. Live Preview and source mode show the label.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Conversions → Save as Markdown**. The dialog opens with these values.

| Setting | What it does |
|---|---|
| **Default folder for Markdown files** | Sets where the notes are saved: **Same folder as the book** or **In the folder specified below**. The default is **Same folder as the book** |
| **Markdown folder path** | Sets the folder for the notes. Shown when **Default folder for Markdown files** is **In the folder specified below** |
| **Default format** | Sets the format: **Single Obsidian note** or **Book folder**. The default is **Book folder** |
| **Include images** | Saves the book's images with the notes. Enabled by default |
| **Link format** | Sets how images and links are written: **Wikilink** or **Standard Markdown**. The default is **Wikilink**. Not in the dialog |

These settings are shared with your other devices. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## See also

- [Exporting and Converting with Orbis Reader](exporting-and-converting.md): compares the exports
- [Generate Notes](generate-notes.md): writes your annotations to notes, not the book's text
- [Notes to EPUB](notes-to-epub.md): converts notes back into a book
- [Format Support](format-support.md): lists the formats that Orbis Reader opens
- [Settings Reference](settings-reference.md#save-as-markdown): lists every setting on the **Save as Markdown** page
