# Notes to EPUB

← [User Guide](README.md)

---

## Overview

Notes to EPUB converts Obsidian notes into EPUB books. You read the books in Orbis Reader like any other book, with annotations, listening and a saved reading location.

Use it when you want to set the folder, the file name, the chapters and the book details. To convert a note and read it in one step, use [Read in Orbis Reader](read-in-orbis-reader.md). To convert a book into notes, use [Save as Markdown](save-as-markdown.md).

---

## Convert a note

1. In the Files pane, right-click or long-press the note.
2. Select **Save note as EPUB**.
3. Optional: In the dialog, change the chapter breaks, the folder, the file name or the book details.
4. Select **Save**.

You can also open the note and run **Save note as EPUB** from the command palette.

The note's headings become the book's chapters. Before Orbis Reader writes a file, the dialog shows the chapters and the content that is not converted.

For what is converted and what is left out, see [What is converted](#what-is-converted).

---

## Convert a folder

You can convert a folder of notes in two ways:

| Command | Result |
|---|---|
| **Save folder as EPUB** | Makes one EPUB. Each note is a chapter |
| **Save folder notes as EPUBs** | Makes one EPUB for each note, and a contents note that links to all of them. Links between the notes become links between the books |

1. In the Files pane, right-click or long-press the folder.
2. Select **Save folder as EPUB** or **Save folder notes as EPUBs**.
3. Optional: In the dialog, change the chapter breaks, the order, the notes to include, the folder or the book details.
4. Select **Save**. For **Save folder notes as EPUBs**, the button shows the number of EPUBs, such as **Save 12 EPUBs**.

The two commands show only when the folder contains Markdown notes.

After **Save folder notes as EPUBs**, the contents note opens. A link from one book to another opens the other book at its start.

For how each note's chapter is named, see [How chapters are named](#how-chapters-are-named).

---

## Save the EPUB outside the vault

Save the EPUB outside the vault when you make it to send to someone, or to read in another app.

1. In the Files pane, right-click or long-press the note or the folder.
2. Select **Save note as EPUB** or **Save folder as EPUB**.
3. Optional: In the dialog, change the options, as in [Convert a note](#convert-a-note) or [Convert a folder](#convert-a-folder).
4. Do one of these:
   - On a computer, select **Export…** at the left of the dialog's buttons. In the save dialog, select a folder, then select **Save**.
   - On a phone or tablet, select **Share…** at the left of the dialog's buttons. Then select an app to send the EPUB to.

The EPUB has the name in **File name** under **Save to**. The folder under **Save to** is used only by **Save**.

Nothing in the vault changes. Orbis Reader does not ask about a book with the same name in the vault, and it does not write a title note.

On a computer, the save dialog asks before it replaces a file. If you cancel the save dialog, the dialog stays open with your choices kept. A notice shows where the EPUB was saved.

On a phone or tablet, Orbis Reader keeps the EPUB in its plugin folder, in `.obsidian/plugins/orbis-reader/share`, until you share another file or Obsidian starts again. On Android, the first list shows the apps that open an EPUB. To send the EPUB to a person, select Android Share.

**Save folder notes as EPUBs** makes several files, so its dialog has no **Export…** or **Share…** button. **Export…** and **Share…** show only on a device where Obsidian supports them.

---

## Set the chapter breaks

1. In the dialog, go to **Chapter breaks**.
2. Select the heading level that starts a new chapter, or select the option for no chapter breaks.

The dropdown lists only the heading levels that the content has, with the number of headings at each level. If the content has no headings, the dialog shows *There are no headings to break at, so the book is one chapter.*

The option for no chapter breaks is different for each command:

| Command | Option | Result |
|---|---|---|
| **Save note as EPUB** | **None — one chapter** | Makes the whole note one chapter |
| **Save folder as EPUB** | **None — one chapter per note** | Makes each note one chapter |
| **Save folder notes as EPUBs** | **None — one chapter per book** | Makes each book one chapter |

More chapters give you more entries in the table of contents. Moving by chapter, and the chapter controls when you listen, use the same chapters.

For the level that the dialog starts with, see [The default chapter breaks](#the-default-chapter-breaks).

---

## Change the order of the notes

This task applies to a folder conversion.

1. In **Chapter order**, select **File name order** or select a note. For **Save folder notes as EPUBs**, this option is **Contents note order**.
2. Optional: To move a note, select **Move up** or **Move down** next to it, or drag it.
3. Optional: To leave out a note, uncheck it.

When you select a note in step 1, the chapters follow the order of the links in that note. After you move a note by hand, the dropdown shows the note's name followed by `(customized)`. To go back to the original order, select that note again.

A note that you uncheck stays in the list, grayed, in its place. To include it again, check it.

For the order that the dialog starts with, see [The order of the chapters](#the-order-of-the-chapters).

---

## Set the folder and the file name

1. In the dialog, open the **Save to:** section. Its header shows the folder and the file name.
2. In **Save to**, select a folder.
3. In **File name**, type a name.

For **Save folder notes as EPUBs**, step 3 is **New folder name**. The EPUBs and the contents note go in a new folder with this name. The default name is the folder's name followed by `-EPUB`.

The characters `\ / : * ? " < > | # ^ [ ]` cannot be in a file name. Orbis Reader changes each of them to a space, and the header shows the name that it writes.

For the folder that the **Save to:** section starts with, see [Where the files go](#where-the-files-go).

---

## Set the book details

1. In the dialog, open the **Book details** section.
2. Change the fields that you want: **Title**, **Author**, **Language**, **Publisher** or **Publication date**.
3. Optional: In **Type**, select a type, or select **Add a type** to make a new one.

**Type** shows only when [Library Dashboards](library-dashboards.md) is enabled. It sets the `type` property of the book's title note.

For **Save folder notes as EPUBs**, **Book details** has **Author**, **Language** and **Type**. The author applies to each note that does not name its own author.

The header of **Book details** lists the author, publisher and publication date that are filled in. The title shows on its own line at the top of the dialog, after **Title:**.

For where the book's title comes from, see [How the book is named](#how-the-book-is-named).

---

## Convert a book again

When you convert a note or a folder again, Orbis Reader makes the new book and compares it with the book that is already there.

1. Run the same command on the same note or folder.
2. If the **Replace this EPUB?** dialog opens, select **Replace** to write the new book, or **Cancel** to keep the old book.

For **Save folder notes as EPUBs**, the dialog is titled **Replace these EPUBs?**.

To keep the old book and its annotations, give the new book a different file name in the **Save to:** section.

For what each change does to the book and its annotations, see [When a book changes](#when-a-book-changes).

---

## What is converted

The **Not everything carries over** list in the dialog shows the content in your notes that is not converted. This table shows what happens to each type of content.

| Content | Result |
|---|---|
| Headings, lists, tables, quotes and code blocks | Kept |
| Callouts | Kept, with simple styling |
| Footnotes | Kept, with links that work |
| Images in the vault | Kept, and stored in the EPUB |
| External links | Kept |
| Links to notes in the conversion | Kept. With **Save folder notes as EPUBs**, they open the other book at its start |
| Links to headings and blocks (`[[#Heading]]`, `[[Note#^block-id]]`) | Kept, and they go to the heading or block when the note is in the same book |
| Links to notes outside the conversion, and to notes that you unchecked | Changed to plain text |
| Tags | Changed to plain text. They are not counted as lost links |
| Embedded notes and headings (`![[Note]]`, `![[Note#Heading]]`) | Kept. The embedded text is part of the book, without the embedded note's properties |
| Dataview and other plugin blocks | Left out. A block for a plugin that is not installed stays as a code block |
| Math formulas (`$…$`, `$$…$$`), Mermaid diagrams and inline SVG drawings | Left out. The dialog shows the count, such as *3 drawings or formulas will be left out.* |
| Properties | Not part of the text. The title, author and other book details come from them |

Images on the web are not in the book unless you enable the remote images option in the dialog. The option shows the number of images, such as **Fetch 3 remote images**. When it is enabled, Orbis Reader downloads the images from the web servers that store them.

---

## Chapters

To set the chapters, see [Set the chapter breaks](#set-the-chapter-breaks) and [Change the order of the notes](#change-the-order-of-the-notes).

### How chapters are named

When a note becomes a chapter, the chapter takes the first of these that the note has:

1. The note's first top-level heading.
2. The note's `title` property.
3. The note's file name.

[Save as Markdown](save-as-markdown.md) and [Generate Notes](generate-notes.md) write notes whose titles have the book's name and the chapter's name. When you convert these notes, each chapter gets only the chapter's name. For example, an export of *Sample Book* becomes a chapter named `PART I – CHAPTER I`, not `Sample Book: PART I – CHAPTER I`. A note of your own with a colon in its title keeps its full title.

### The default chapter breaks

The **Chapter breaks** setting sets the heading level that the dialog starts with. If the content has no headings at that level, the dialog starts with the next deeper level that has headings. For example, if **Chapter breaks** is **Heading 2** and the note has level 1 and level 3 headings only, the dialog starts with level 3. A higher level is used instead when it has more headings than that deeper level, or when no deeper level has headings. For example, a note with 144 level 1 headings and 5 level 3 headings is split at level 1. If the content has no headings, the book is one chapter.

For **Save folder notes as EPUBs**, the chapter breaks apply inside each note's book.

### The order of the chapters

In a folder conversion, the chapter order comes from an index note, if the folder has one. An index note is named `README.md`, `index.md` or `home.md`. If the folder has more than one, Orbis Reader uses them in that order.

The name of an index note can start with a number, such as `001-README.md`. Orbis Reader still finds it.

The notes are in the order that the index note links to them. A note that the index note does not link to goes at the end, in file name order. The dialog shows how many notes went at the end.

If the folder has no index note, the notes are in file name order. File name order sorts numbers by value, so `10-` comes after `9-`.

A folder that Save as Markdown or Generate notes wrote has no `README.md`. Its index note is the contents note, `000 - {Book Title}.md`. The dialog also takes the book's title, author, language and publisher from this note. So when you convert an export back to an EPUB, the book details come from the original book.

---

## Where the files go

The **Default folder for EPUB files** setting sets the folder that the **Save to:** section starts with. All three commands use this setting.

- **Beside the note or folder**: the EPUB goes in the same folder as the note. A folder's EPUB goes beside the folder, not inside it.
- **In the folder specified below**: the EPUB goes in the folder that you set in **EPUB folder path**.

With **Save folder notes as EPUBs**, Orbis Reader also writes a contents note that lists every book in the order that you selected. Orbis Reader writes this note again on each conversion. Anything that you add to it is replaced the next time.

For saving an EPUB outside the vault, see [Save the EPUB outside the vault](#save-the-epub-outside-the-vault).

---

## How the book is named

The title of the book and the name of the file are separate. A change to one does not change the other.

For a note, the title comes from the note's `title` property. If the note has no `title` property, the title is the note's file name. The note's headings are not used for the title.

For a folder, the title comes from the first of these that exists:

1. The index note's `title` property.
2. The index note's first top-level heading.
3. The folder's name.

For example, a folder named `Investing` has an index note with `title: The Investing Approach`. The book's title is *The Investing Approach*, and the file is still `Investing.epub`.

---

## When a book changes

Annotations and reading locations belong to the book's file. When you convert again to the same file, the new book keeps the old book's annotations. If the text changed, an annotation can show in the wrong place, or not show.

When you convert again, one of these happens:

| Situation | Result |
|---|---|
| Nothing changed | Orbis Reader does not write the book. A notice shows that the book is already up to date |
| Only the book details changed, such as the author | Orbis Reader replaces the book |
| The text changed | The **Replace this EPUB?** dialog opens. If the book has annotations, the dialog shows that they may be in the wrong place |

For **Save folder notes as EPUBs**, the **Replace these EPUBs?** dialog opens only for books whose text changed and that have annotations. The other books are replaced or left as they are.

Each of these changes the text of the book:

- You edit the note, or a note in the folder.
- You edit a note that one of them embeds with `![[…]]`.
- You select a different **Chapter breaks** level.
- You check or uncheck a note in a folder conversion. This changes links to that note into plain text, or back into links.
- An update to Orbis Reader changes how it converts notes.

To keep your annotations in the right place:

- Finish editing the notes, then convert them, then read the book. Annotations that you make after the last conversion stay in place.
- To keep the old book and its annotations, convert to a new file name.
- For a folder that you are still writing, use **Save folder notes as EPUBs**. An edit to one note can then move annotations only in that note's book. In one book, an edit near the start can move every annotation after it.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Conversions → Save as EPUB**.

| Setting | What it does |
|---|---|
| **Default folder for EPUB files** | Sets where the EPUB goes: **Beside the note or folder** or **In the folder specified below** |
| **EPUB folder path** | Sets the folder for EPUB files. Shown only when **Default folder for EPUB files** is **In the folder specified below** |
| **Fetch remote images by default** | Enables the remote images option in the dialog when the dialog opens |
| **Type for converted books** | Sets the `type` property of a converted book's title note. Shown only when Library dashboards is enabled |
| **Chapter breaks** | Sets the heading level that starts a new chapter. The default is **Heading 2**. [Read in Orbis Reader](read-in-orbis-reader.md) uses the same setting |

**Fetch remote images by default** applies only to the device you set it on. The other settings are shared with your other devices. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## See also

- [Read in Orbis Reader](read-in-orbis-reader.md): converts a note and opens the book in one step
- [Save as Markdown](save-as-markdown.md): converts a book's text into Markdown notes
- [Marks and Notes](marks-and-notes.md): describes the annotations that a new conversion can move
- [Library Dashboards](library-dashboards.md): describes title notes and the `type` property
- [Format Support](format-support.md): compares EPUB with the other formats that Orbis Reader opens
- [Settings Reference](settings-reference.md#save-as-epub): lists every setting on the **Save as EPUB** page
