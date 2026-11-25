# Marks and Notes

← [User Guide](README.md)

---

## Overview

Use annotations to save passages, your own notes and locations in a book. Orbis Reader has three kinds of annotation: passage selections, annotation notes and bookmarks.

To set up the marks that you apply, see [Annotations and Presets](annotations-and-presets.md).

---

## Kinds of annotation

| Annotation | What it is |
|---|---|
| Passage selection | A passage that you select in the book and give a mark |
| Annotation note | A passage that you select in the book and add your own text to. It can also have a mark |
| Bookmark | A saved location in the book. It is anchored to the sentence at the top of the page when you create it |

A mark has a name that you give it, such as *Key point*, *Quote* or *Follow up*. Each mark also has an appearance: a highlighter, a treatment such as an underline or a box, or both. You select a color for each. Two marks can have the same highlighter color with different treatments.

A passage selection always has a mark. Only an annotation note can be unmarked. In filters, notes without a mark are listed as **Unmarked notes**.

Orbis Reader stores a book's annotations in the book's .orbis file. See [The .orbis File](orbis-file.md).

---

## The marks bar

The marks bar opens when you select text. It opens in these places:

| Device | Where the marks bar opens |
|---|---|
| Desktop | Below the toolbar. In Focus mode, at the top of the reader |
| Phone or tablet | At the top of the reader |
| Phone or tablet, in Focus mode | At the bottom of the screen, over the progress indicator |

Each mark on the bar shows its appearance on the sample text `Aa`. The bar shows the first marks of the book's list, in order: three on a phone, and five on other devices. **All marks** opens the list of all the book's marks. The last item in that list is **Manage marks**, which opens the **Marks manager**.

These buttons are also on the bar:

| Button | What it does |
|---|---|
| **Copy text** | Copies the selected text to the clipboard |
| **Add note** | Opens the note editor to add a note to the selected passage |
| **Look up** | Looks up the selected text. See [Look-up](look-up.md) |
| **Copy link to selection** | Copies a link that opens the book at the selected passage |
| **Remove passage selection** | Deletes the passage selection |

You can also open the **Marks manager** with the **Annotation marks** button on the toolbar. The commands **Annotation marks for this book** and **Manage annotation presets** also open it. See [Annotations and Presets](annotations-and-presets.md#open-the-marks-manager).

### What the bar shows

| What you select | Buttons on the bar |
|---|---|
| Text with no annotation | **Copy text**, **Add note**, the marks, **All marks**, **Copy link to selection** and **Look up** |
| A passage selection | **Copy text**, **Add note**, the marks, **All marks**, **Copy link to selection** and **Remove passage selection**. The current mark is ringed, and its name shows briefly below the bar, or above it when the bar is at the bottom of the screen. **Look up** is not on the bar |
| Text that overlaps a passage selection or a note | **Copy text**, **Copy link to selection** and **Look up** |

Text can have only one passage selection or annotation note, so when the selected text overlaps a passage selection or a note, the bar has no marks and no **Add note**. To change the annotation, select the passage selection itself.

---

## Mark a passage

1. Select text in the book. The marks bar opens.
2. Select a mark.

The passage shows the mark, and the marks bar closes.

If the text overlaps a passage selection or a note, the bar has no marks. See [What the bar shows](#what-the-bar-shows).

To use a mark that is not on the bar, select **All marks** (the **…** button). Then select the mark in the list.

You can also select and mark text with commands. See [Mark from the keyboard](#mark-from-the-keyboard).

---

## Change or remove a passage selection

1. Select the passage selection. The marks bar opens.
2. Do one of these:
   - To change the mark, select a different mark.
   - To remove the passage selection, select **Remove passage selection** (the trashcan icon) at the end of the bar.

---

## Write an annotation note

1. Select a passage.
2. On the marks bar, select **Add note**. The note editor opens.
3. Type the text of the note.
4. Optional: Select a mark. To write a note without a mark, select **Unmarked**.
5. Select **Save**.

**Unmarked** is the first button in the row of marks, with a × icon.

If the text overlaps a passage selection or a note, the bar has no **Add note**. See [What the bar shows](#what-the-bar-shows).

---

## Change a passage selection into an annotation note

1. Select the passage selection. The marks bar opens.
2. Select **Add note**.
3. Type the text of the note.
4. Select **Save**.

The note keeps the mark of the passage selection.

---

## Change an annotation note

1. Select the note icon in the margin beside the passage. The note opens.
2. Select **Edit**.
3. Change the text or the mark.
4. Select **Save**.

For how to show or hide the note icons, see [Note icons](#note-icons).

---

## Delete an annotation note

1. Select the note icon in the margin beside the passage. The note opens.
2. Select **Delete**.
3. If the **Delete note** dialog opens, select **Delete**.

To delete a note without the **Delete note** dialog, disable **Settings → Orbis Reader → Reading behavior → Confirm before deleting notes**.

---

## Note icons

Note icons in the margin show where your annotation notes are. To show or hide them, select **Toggle note icons** on the toolbar, or run **Toggle note icons** from the command palette.

Hiding the icons does not hide or delete your notes. When the icons are shown, the reader keeps space for them in the right margin. On a phone, you can hide the icons to get this space back.

The note icons setting applies only to the device you set it on. See [Sync and Devices](sync-and-devices.md).

---

## Bookmarks

A bookmark is anchored to the sentence at the top of the page when you create it. An audio bookmark is anchored to the sentence that is being read.

The **Annotations** tab lists both kinds together. A headphones icon shows an audio bookmark.

Only reading records show a bookmark's sentence, as the excerpt. See [Reading Records](reading-records.md).

---

## Add or remove a bookmark

To add a bookmark, select **Bookmark this location** on the toolbar. The button fills to show that the page has a bookmark.

To remove the bookmark, select the button again. Its label is then **Remove bookmark**.

You can also run **Toggle bookmark on current location** from the command palette.

---

## Add an audio bookmark

1. Start listening to the book.
2. While the audio plays or is paused, do one of these:
   - On the toolbar, select the bookmark button.
   - In the full-screen audio player, select **Bookmark**.

To remove the audio bookmark, select the button again while the same sentence is being read.

---

## Mark while you listen

In the full-screen audio player, these buttons act on the text that is being read. You do not select text first.

| Button | What it does |
|---|---|
| **Mark the passage** | Applies a mark to the sentence or paragraph that is being read |
| **Add note** | Opens the note editor for the sentence or paragraph that is being read |
| **Bookmark** | Adds an audio bookmark to the sentence that is being read |

To set how much text these buttons use, go to **Settings → Orbis Reader → Listening → Full-screen audio player**. To select the marks that these buttons apply, see [Annotations and Presets](annotations-and-presets.md#select-the-marks-for-listening-and-notes).

Before version 0.1.7, a mark or note made on a whole **Paragraph** while a recording played was saved but did not show. To put these back on their paragraph, run **Scan annotation data for problems** and select **Repair**. See [Passage selections or notes do not show](troubleshooting.md#passage-selections-or-notes-do-not-show).

For more about the player, see [Listening](listening.md).

---

## Mark from the keyboard

Use these commands to select and mark text without a pointer. To give a command a hotkey, see the [Command Reference](command-reference.md).

| Command | What it does |
|---|---|
| **Select sentence** | Selects the sentence at the reading location |
| **Select paragraph** | Selects the paragraph at the reading location |
| **Select previous sentence** | Selects the sentence before the current one |
| **Extend selection by a sentence** | Adds the next sentence to the selection |
| **Shrink selection by a sentence** | Removes a sentence from the selection |
| **Clear selection** | Clears the selection |
| **Apply mark 1** to **Apply mark 9** | Applies the mark at that position in the book's list of marks |
| **Apply no mark (note editor)** | Opens the note editor on the selection, with no mark |

Use these commands to move between your passage selections and annotation notes.

| Command | What it does |
|---|---|
| **Go to next mark or note**, **Go to previous mark or note** | Goes to the next or previous passage selection or note |
| **Go to next passage selection**, **Go to previous passage selection** | Goes to the next or previous passage selection |
| **Go to next note**, **Go to previous note** | Goes to the next or previous note |
| **Delete the selected mark or note** | Deletes the passage selection or note that you selected or went to |

You can also press **Delete** or **Backspace** to delete the passage selection whose marks bar is open, or the note that is open in the note view. On a Mac, this is the **delete** key. A passage selection is deleted at once. A note asks first if **Confirm before deleting notes** is turned on. The keys do nothing while the marks bar is open on a new selection, and they edit text as usual in the note editor.

---

## Go to an annotation

1. Run **Open Annotations tab** from the command palette. You can also select **Navigator** on the toolbar, then select the **Annotations** tab.
2. Select an annotation.

The reader goes to the annotation, and the text flashes briefly.

---

## The Annotations tab

The **Annotations** tab of the Navigator lists all the annotations in the current book, under three headings: **Bookmarks**, **Passage selections** and **Notes**. The annotations are grouped by chapter, in reading order.

Each entry shows its location. A heading with no annotations shows **None yet**.

---

## Copy annotations to the clipboard

Run one of these commands from the command palette.

| Command | What it does |
|---|---|
| **Copy passage selections to clipboard** | Copies every passage selection in the current book |
| **Copy notes to clipboard** | Copies the text of every annotation note in the current book |
| **Copy bookmarks to clipboard** | Copies every bookmark and its location |
| **Copy link to current location** | Copies a link that opens the book at your current location |

The passage selections, notes and bookmarks are copied in the order that they appear in the book.

To select chapters, use templates or filter by mark, use [Generate Notes](generate-notes.md).

For more about the links that **Copy link to current location** and **Copy link to selection** make, see [Deep Links](deep-links.md).

---

## Options and settings

| Setting | What it does |
|---|---|
| **Settings → Orbis Reader → Listening → Full-screen audio player → How much the mark button marks** | Sets how much text **Mark the passage** marks: **Sentence** or **Paragraph** |
| **Settings → Orbis Reader → Listening → Full-screen audio player → How much the note button captures** | Sets how much text **Add note** captures: **Sentence** or **Paragraph** |
| **Settings → Orbis Reader → Reading behavior → Confirm before deleting notes** | Shows the **Delete note** dialog before a note is deleted |
| **Settings → Orbis Reader → Reading behavior → Flash book text for navigation and search results** | Flashes the text when you go to an annotation, a link or a search result |
| **Settings → Orbis Reader → Appearance → Toolbar → Show bookmark button** | Shows the bookmark button on the toolbar |
| **Settings → Orbis Reader → Appearance → Toolbar → Show note icons button** | Shows the **Toggle note icons** button on the toolbar |
| **Settings → Orbis Reader → Appearance → Toolbar → Show annotation marks button** | Shows the **Annotation marks** button on the toolbar |

---

## See also

- [Annotations and Presets](annotations-and-presets.md): describes marks, presets and the **Marks manager**
- [Generate Notes](generate-notes.md): writes your annotations to Obsidian notes
- [Reading Records](reading-records.md): writes one vault note for each annotation
- [Save Annotations as PDF](save-annotations-as-pdf.md): writes your passage selections and notes to a PDF
- [Save as PDF](save-as-pdf.md): converts the book to a PDF with your marks
- [Listening](listening.md): describes the full-screen audio player
- [Settings Reference](settings-reference.md): lists every setting, including the ones that change marking
