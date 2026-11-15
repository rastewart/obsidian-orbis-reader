# Read in Orbis Reader

← [User Guide](README.md)

---

## Overview

**Read in Orbis Reader** converts an Obsidian note, such as a web page saved with the Web Clipper, into an EPUB book and opens it.

Use it to read a note with annotations, listening, reading stats, reading records and a saved reading location.

It is faster than [Notes to EPUB](notes-to-epub.md) because it uses your settings and does not open a dialog.

---

## Read a note in Orbis Reader

1. In the Files pane, right-click or long-press the note.
2. Select **Read in Orbis Reader**.

You can also open the note and run **Read in Orbis Reader** from the command palette.

If the conversion takes some time, the **Making the book** dialog shows until the book opens. If the conversion fails, a notice shows the name of the note.

For where the book is saved, see [Where the book is saved](#where-the-book-is-saved). For how the note's headings become chapters, see [Chapters](#chapters). For the book's title note, see [Title notes in the library](#title-notes-in-the-library).

---

## Read a note again after you change it

If you change a note and its book has annotations, Read in Orbis Reader prompts you before it makes a new book.

1. Run **Read in Orbis Reader** on the note.
2. In the **This note changed after the book was created** dialog, do one of these:
   - To read a version that has your annotations, select **Open** next to that version.
   - To read the note's current text, select **Create a new version**. The new version has no annotations.

Each version in the dialog shows its number, the date it was made and its number of annotations. When more than one version has annotations, the dialog is titled **This note changed after these versions were created**.

For what each run does, see [What happens when you run it again](#what-happens-when-you-run-it-again). For how versions are named, see [Versions](#versions).

---

## Change how the book opens

By default, a book from Read in Orbis Reader opens the same way as other books. These are set in **Settings → Orbis Reader → Reading behavior → Opening a book**.

1. Go to **Settings → Orbis Reader → Reading behavior → Read in Orbis Reader**.
2. Enable **Change how the book opens when using Read in Orbis Reader**.
3. In **How the book opens**, select a reading mode.
4. Optional: In **Open with**, select a bar.

For example, to listen to a saved web page when it opens, select **Full-screen audio player**.

For the options of these settings, see [Read in Orbis Reader](settings-reference.md#read-in-orbis-reader) and [Opening a book](settings-reference.md#opening-a-book) in the Settings Reference.

---

## Where the book is saved

Read in Orbis Reader saves the book in the same folder as the note, with the same name. For example, `Clippings/Sample Book review.md` makes `Clippings/Sample Book review.epub`. You cannot change this location or name, because Read in Orbis Reader uses them to find the book the next time you run it.

If the note's name is longer than 80 characters, the book's name is shortened.

If you move or rename the note after Read in Orbis Reader makes its book, the note and the book are no longer connected. The next time you run Read in Orbis Reader on the note, it makes a new book beside the note. The old book stays in its folder with its annotations.

---

## Chapters

The book's chapters start at the note's headings. The **Chapter breaks** setting sets the heading level. Notes to EPUB uses the same setting.

If the note has no headings at that level, the book uses the next deeper level that has headings. For example, if **Chapter breaks** is **Heading 2** and the note has level 1 and level 3 headings only, the book uses level 3. A higher level is used instead when it has more headings than that deeper level, or when no deeper level has headings. For example, a note with 144 level 1 headings and 5 level 3 headings is split at level 1.

---

## Title notes in the library

If [Library Dashboards](library-dashboards.md) is enabled, Read in Orbis Reader makes a title note for each book. The title note has these properties:

- `type`: `obsidian-note` by default. Use it to tell these books apart from books that you downloaded or bought. To change the value, change the **Type** setting.
- `source_notes`: a link to the note that the book was made from.
- `source_url`: the URL from the note's `source` property, if the note has one. The Web Clipper writes this property.

---

## What happens when you run it again

| Situation | Result |
|---|---|
| The note has no book | Makes a book and opens it |
| The note has not changed | Opens the same book at your reading location |
| The note changed, and its book has no annotations | Rebuilds the book from the new text and opens it |
| The note changed, and its book has annotations | Opens the **This note changed after the book was created** dialog |

Only a change to the note's text counts as a change. A change to the note's properties does not count. Blank lines at the start or end of the note do not count.

If the note's text matches a version that already exists, that version opens and the dialog does not show. For example, you edit a note, create a new version, and then undo the edit. The text now matches the first version again, so the first version opens. This is true even if the newer version has annotations.

---

## Versions

The first version of a book has the same name as the note: `Sample Book review.epub`. The next versions have a number: `Sample Book review - v002.epub`, then `Sample Book review - v003.epub`.

A new version always gets a number one higher than the highest version in the folder. For example, if you delete `v002` while `v003` is in the folder, the next version is `v004`.

Read in Orbis Reader does not delete or replace a version that has annotations. Each version keeps its annotations and its reading location.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Reading behavior → Read in Orbis Reader**.

| Setting | What it does |
|---|---|
| **Change how the book opens when using Read in Orbis Reader** | Shows **How the book opens** and **Open with**. When it is disabled, the book opens the same way as other books. Disabled by default |
| **How the book opens** | Sets the reading mode: **Standard mode**, **Focus mode** or **Full-screen audio player**. The default is **Standard mode** |
| **Open with** | Sets the bar that opens under the toolbar: **Listening bar**, **Search bar** or **No bar**. The default is **Listening bar**. Hidden when the reading mode is **Full-screen audio player** |
| **Type** | Sets the `type` property of the book's title note. The default is `obsidian-note`. Shown only when Library dashboards is enabled |

**Chapter breaks** is in **Settings → Orbis Reader → Conversions → Save as EPUB**. It sets the heading level that starts a new chapter. The default is **Heading 2**.

**Type** and **Chapter breaks** are shared with your other devices. The other settings apply only to the device you set them on. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## See also

- [Notes to EPUB](notes-to-epub.md): converts notes to EPUB with a dialog for the folder, file name and chapters
- [Reading a Book](reading-a-book.md): describes the reader that the book opens in
- [Marks and Notes](marks-and-notes.md): describes the annotations that a new version does not include
- [Library Dashboards](library-dashboards.md): describes title notes and the `type` property
- [Settings Reference](settings-reference.md#read-in-orbis-reader): lists every setting on this page
