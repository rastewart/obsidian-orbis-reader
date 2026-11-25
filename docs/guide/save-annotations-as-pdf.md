# Save Annotations as PDF

← [User Guide](README.md)

---

## Overview

**Save annotations as PDF** writes your passage selections and notes as a PDF digest, in reading order, under the chapter that each one is in.

The digest does not include the book's text or your bookmarks. Use it to send your annotations to another person.

---

## Save your annotations as a PDF

1. Open the book.
2. In the **⋯** menu, select **Save annotations as PDF**.
3. Optional: To change the folder or the file name, open **Save to** and change them.
4. Optional: To print your name on the PDF, open **Marked up by** and enter it.
5. Optional: To leave out chapters, open **Chapters with marks and notes** and uncheck them.
6. Optional: To include only some marks, open **Marks to include**. See [Include only some marks](#include-only-some-marks).
7. Optional: If the dialog shows **Download the expanded character set**, check or uncheck it.
8. Select **Save**.

You can also run **Save annotations as PDF** from the command palette.

If a file with that name already exists, the **Overwrite PDF?** dialog prompts you. Select **Replace** to overwrite the file. Select **Cancel** to go back to the dialog with your choices kept.

For the options in the dialog, see [The dialog](#the-dialog). For what the PDF contains, see [What the digest contains](#what-the-digest-contains).

---

## Save the PDF outside the vault

Save the PDF outside the vault when you make it to send to someone, or to keep with files that are not notes.

1. Open the book.
2. In the **⋯** menu, select **Save annotations as PDF**.
3. Optional: Change the options, as in steps 3 to 7 of [Save your annotations as a PDF](#save-your-annotations-as-a-pdf).
4. Do one of these:
   - On a computer, select **Export…** at the left of the dialog's buttons. In the save dialog, select a folder, then select **Save**.
   - On a phone or tablet, select **Share…** at the left of the dialog's buttons. Then select an app to send the PDF to.

The PDF has the name in **File name** under **Save to**. The folder under **Save to** is used only by **Save**.

On a computer, the save dialog asks before it replaces a file. If you cancel the save dialog, the **Save annotations as PDF** dialog stays open with your choices kept. A notice shows where the PDF was saved.

On a phone or tablet, the PDF is not saved in your vault. Orbis Reader keeps it in its plugin folder, in `.obsidian/plugins/orbis-reader/share`, until you share another PDF or Obsidian starts again. On Android, the first list shows the apps that open a PDF. To send the PDF to a person, select Android Share.

**Export…** and **Share…** show only on a device where Obsidian supports them.

---

## Include only some marks

Include only some marks when you only want a digest of one kind of annotation, such as only the passages marked **Question** to discuss with someone.

1. In the **Save annotations as PDF** dialog, open **Marks to include**.
2. Optional: To leave out a type, select **Passage selections** or **Note selections**. At least one of the two must stay on.
3. Select **Select marks**.
4. Check the marks to include. To include the notes that have no mark, check **Unmarked notes**.
5. Select **Done**.

The PDF does not include the passage selections and notes that you leave out. When you include fewer marks, **Chapters with marks and notes** can show fewer chapters, because a chapter with no matching marks has nothing to show.

---

## The dialog

The line at the top of the dialog shows what the PDF will contain, for example `10 marks and notes across 4 chapters`. The line changes when you change the options.

**Chapters with marks and notes** lists only the chapters that have passage selections or notes. Each row shows the number of marks and notes in the chapter. The number stays on a row that you uncheck, so you can see what you leave out.

**Marked up by** is printed under the title of the PDF. The dialog opens with the name from your settings. A name that you type in the dialog is used for that PDF only.

[Save as PDF](save-as-pdf.md) uses the same **Marked up by** name. When you change the name in the settings of one feature, the other feature uses the new name too.

### Where the PDF is saved

The header of **Save to** shows the path where the file will be saved. The default folder is in **Settings → Orbis Reader → Annotations → Save annotations as PDF**. It is the folder of the book, or a folder that you select. The default file name is the book's title.

Save as PDF has a different default folder setting. You can save a digest to send in one folder and a copy of the book to keep in another.

These characters cannot be in a file name: `\ / : * ? " < > | # ^ [ ]`. Orbis Reader changes each one to a space. This applies to names from the book's title and to names that you type. The header of **Save to** shows the name that will be written. A name longer than 120 characters is shortened.

For saving the PDF outside the vault, see [Save the PDF outside the vault](#save-the-pdf-outside-the-vault).

### The expanded character set

Without the expanded character set, a PDF can show about 220 characters. This is enough for most English text. Other characters, such as arrows, Greek letters and mathematical symbols, print as `?`.

If the expanded character set is not on this device, the dialog shows **Download the expanded character set**. It is checked by default. The download is 1.8 MB, one time, and it goes into your vault's fonts folder. When the download is on the device, the option does not show again.

If you uncheck it, the PDF is still saved, with the smaller set of characters.

Save annotations as PDF and Save as PDF use the same expanded character set. To remove it, delete the DejaVu fonts on the **Fonts** page. See [Save as PDF](save-as-pdf.md#the-expanded-character-set).

---

## What the digest contains

- The title, the author, the **Marked up by** name and the date.
- **What the marks mean**: a legend that shows what each mark means.
- Each chapter, with its subheadings. Under each, your passage selections with their marks, and your notes in italics under the passages.
- The mark's name and the location of each passage, in small type.

Quoted passages keep the line breaks that they have in the book.

A mark shows in the PDF with its name, color and treatment, not with its badge. An emoji in a passage or a note prints in color, as it looks on the device that made the PDF.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Annotations → Save annotations as PDF**.

| Setting | What it does |
|---|---|
| **Default folder for PDF files** | Sets where the PDF is saved: **Same folder as the book** or **In the folder specified below**. The default is **Same folder as the book** |
| **PDF folder path** | Sets the folder for the PDF. Shown when **Default folder for PDF files** is **In the folder specified below** |
| **Marked up by** | Sets the name printed under the title of the PDF. Save as PDF uses the same name. Empty by default |

These settings are shared with your other devices. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## Troubleshooting

### Save annotations as PDF is unavailable

**Save annotations as PDF** is unavailable when the book has no passage selections or notes. Bookmarks do not count. In the **⋯** menu, the item is grayed out. In the command palette, the command is not listed.

---

## See also

- [Save as PDF](save-as-pdf.md): converts the book to a PDF, with or without your marks
- [Generate Notes](generate-notes.md): writes the same annotations as Markdown notes in your vault
- [Marks and Notes](marks-and-notes.md): describes how to make the annotations that this PDF contains
- [Annotations and Presets](annotations-and-presets.md): describes marks and how to name them
- [Exporting and Converting with Orbis Reader](exporting-and-converting.md): compares the exports
- [Settings Reference](settings-reference.md#save-annotations-as-pdf): lists every setting on the **Save annotations as PDF** page
