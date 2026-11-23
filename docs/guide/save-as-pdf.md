# Save as PDF

← [User Guide](README.md)

---

## Overview

**Save as PDF** converts a book to a PDF, with your marks drawn where you made them and your notes as PDF comments if you decide to include them.

Use it to send the book with your annotations to another person, or to make a PDF of the book without them. To send only your passage selections and notes, use [Save Annotations as PDF](save-annotations-as-pdf.md).

---

## Save a book as a PDF

1. Open the book.
2. In the **⋯** menu, select **Save as PDF**.
3. Optional: To change the folder or the file name, open **Save to** and change them.
4. Optional: To print your name on the cover sheet, open **Marked up by** and enter it.
5. Optional: To include only some chapters, open **Chapters**. See [Select the chapters](#select-the-chapters).
6. Optional: To make a PDF without your marks and notes, disable **Include marks and notes**.
7. Optional: To leave out the first page with the title and the legend, disable **Cover sheet**.
8. Optional: To draw only some marks, open **Marks to include**. See [Include only some marks](#include-only-some-marks).
9. Optional: If the dialog shows **Download the expanded character set**, check or uncheck it.
10. Select **Save**.

You can also run **Save as PDF** from the command palette. Save as PDF is always available, even for a book with no annotations.

The first time you open a book, Orbis reads the whole book in the background to learn its chapters. If you select **Save as PDF** before it finishes, the notice **Preparing the chapter list…** shows until it has, and then the dialog opens. On a large book on a phone, this can take a little while.

If a file with that name already exists, the **Overwrite PDF?** dialog prompts you. Select **Replace** to overwrite the file. Select **Cancel** to go back to the dialog with your choices kept.

For the options in the dialog, see [The dialog](#the-dialog). For what the PDF contains, see [What the PDF contains](#what-the-pdf-contains).

---

## Save the PDF outside the vault

Save the PDF outside the vault when you make it to send to someone, or to keep with files that are not notes.

1. Open the book.
2. In the **⋯** menu, select **Save as PDF**.
3. Optional: Change the options, as in steps 3 to 9 of [Save a book as a PDF](#save-a-book-as-a-pdf).
4. Do one of these:
   - On a computer, select **Export…** at the left of the dialog's buttons. In the save dialog, select a folder, then select **Save**.
   - On a phone or tablet, select **Share…** at the left of the dialog's buttons. Then select an app to send the PDF to.

The PDF has the name in **File name** under **Save to**. The folder under **Save to** is used only by **Save**.

On a computer, the save dialog asks before it replaces a file. If you cancel the save dialog, the **Save as PDF** dialog stays open with your choices kept. A notice shows where the PDF was saved.

On a phone or tablet, the PDF is not saved in your vault. Orbis Reader keeps it in its plugin folder, in `.obsidian/plugins/orbis-reader/share`, until you share another PDF or Obsidian starts again. On Android, the first list shows the apps that open a PDF. To send the PDF to a person, select Android Share.

**Export…** and **Share…** show only on a device where Obsidian supports them.

---

## Select the chapters

Select the chapters when you want a PDF of part of a book, such as the chapters that you are discussing with someone.

1. In the **Save as PDF** dialog, open **Chapters**.
2. In the dropdown, select **All *n* chapters** or **Only the *n* with marks**.
3. Optional: Check or uncheck chapters in the list.

**Only the *n* with marks** is available only when **Include marks and notes** is enabled. To change all rows, select **Select all**, **Clear** or **Invert**. **Chapters** shows only when the book has two or more chapters.

For what a chapter includes, see [What the PDF contains](#what-the-pdf-contains).

---

## Include only some marks

Include only some marks when you want the PDF to show one kind of annotation, such as only the passages marked **Question**.

1. In the **Save as PDF** dialog, open **Marks to include**.
2. Optional: To leave out a type, select **Passage selections** or **Note selections**. At least one of the two must stay on.
3. Select **Select marks**.
4. Check the marks to include. To include the notes that have no mark, check **Unmarked notes**.
5. Select **Done**.

The PDF does not draw the marks that you leave out. The text under them stays in the PDF, without a mark.

---

## The dialog

The line at the top of the dialog shows what the PDF will contain, for example *The book, with your marks and notes*. The line changes when you change the options.

| Option | What it does |
|---|---|
| **Chapters** | Lists every chapter in the book |
| **Include marks and notes** | Draws your marks and adds your notes. Enabled by default. When disabled, the PDF is a copy of the book without your annotations, and **Cover sheet** and **Marked up by** do not show. Shown only when the book has passage selections or notes |
| **Cover sheet** | Adds a first page with the title and the legend. Enabled by default. Shown only when **Include marks and notes** is enabled |
| **Marked up by** | Prints a name on the cover sheet. Shown only when **Cover sheet** is enabled |
| **Marks to include** | Limits the marks that are drawn. Shown only when **Include marks and notes** is enabled |

The dialog opens with the **Marked up by** name from your settings. A name that you type in the dialog is used for that PDF only.

[Save Annotations as PDF](save-annotations-as-pdf.md) uses the same **Marked up by** name. When you change the name in the settings of one feature, the other feature uses the new name too.

### Where the PDF is saved

The header of **Save to** shows the path where the file will be saved. The default folder is in **Settings → Orbis Reader → Conversions → Save as PDF**. It is the folder of the book, or a folder that you select. The default file name is the book's title.

Save annotations as PDF has a different default folder setting. You can save a copy of the book to keep in one folder and a digest to send in another.

These characters cannot be in a file name: `\ / : * ? " < > | # ^ [ ]`. Orbis Reader changes each one to a space. This applies to names from the book's title and to names that you type. The header of **Save to** shows the name that will be written. A name longer than 120 characters is shortened.

For saving the PDF outside the vault, see [Save the PDF outside the vault](#save-the-pdf-outside-the-vault).

### The expanded character set

Without the expanded character set, a PDF can show about 220 characters. This is enough for most English text. Other characters, such as arrows, Greek letters and mathematical symbols, print as `?`.

The expanded character set adds arrows, mathematical symbols, currency symbols, Greek, Cyrillic and accented Latin letters. The download is 3.1 MB, one time, and it stays on this device. Save as PDF and Save annotations as PDF use the same expanded character set.

You can download it in three places:

- **Settings → Orbis Reader → Setup → Expanded PDF character set**.
- The **Save as PDF** or **Save annotations as PDF** dialog, with **Download the expanded character set**. It is checked by default and shows only when the download is not on this device.
- **Settings → Orbis Reader → Conversions → Save as PDF → Expanded character set**. This row shows whether the download is on this device.

If you do not download it, the PDF is still saved, with the smaller set of characters.

To remove the expanded character set, go to **Settings → Orbis Reader → Conversions → Save as PDF → Expanded character set** and select **Remove**. This is the only place to remove it.

---

## What the PDF contains

- The book's headings, with an outline that a PDF viewer can show in its sidebar.
- Your marks, drawn as they are in the reader: the highlighter behind the words and the treatment over them. A mark that does not use color also shows in the PDF.
- Your notes, as PDF comments. A PDF viewer shows them in its comment pane.
- The book's tables and images.
- The book's links, to web pages and to other places in the book.

The cover sheet shows the title, the author, the date, the **Marked up by** name and the legend.

A mark shows in the PDF with its name, color and treatment, not with its badge. An emoji in the book's text prints in color, as it looks on the device that made the PDF.

A chapter is a top-level entry in the book's table of contents, so a chapter includes the headings under it. An entry that groups chapters, such as a part or one novel of an omnibus, opens into those chapters.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Conversions → Save as PDF**.

| Setting | What it does |
|---|---|
| **Default folder for PDF files** | Sets where the PDF is saved: **Same folder as the book** or **In the folder specified below**. The default is **Same folder as the book** |
| **PDF folder path** | Sets the folder for the PDF. Shown when **Default folder for PDF files** is **In the folder specified below** |
| **Marked up by** | Sets the name printed on the cover sheet. Save annotations as PDF uses the same name. Empty by default |
| **Include marks and notes** | Draws your marks into the book's text. Enabled by default |
| **Cover sheet** | Adds a first page with the title and what each mark means. Enabled by default. Shown when **Include marks and notes** is enabled |
| **Expanded character set** | Shows whether the expanded character set is on this device. Select **Download** to add it or **Remove** to delete it |

The expanded character set is stored on each device. The other settings are shared with your other devices. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## See also

- [Save Annotations as PDF](save-annotations-as-pdf.md): writes your passage selections and notes as a PDF, without the book's text
- [Save as Markdown](save-as-markdown.md): converts the same book to notes in your vault
- [Marks and Notes](marks-and-notes.md): describes how to make the annotations that this PDF draws
- [Annotations and Presets](annotations-and-presets.md): describes marks and how to name them
- [Exporting and Converting with Orbis Reader](exporting-and-converting.md): compares the exports
- [Settings Reference](settings-reference.md#save-as-pdf): lists every setting on the **Save as PDF** page
