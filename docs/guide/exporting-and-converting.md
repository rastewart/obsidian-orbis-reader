# Exporting and Converting with Orbis Reader

← [User Guide](README.md)

---

## Overview

Orbis Reader can save a book's annotations as notes in the vault or a PDF, and convert a book or your Obsidian notes into other formats. Settings has a page for each: **Annotations** and **Conversions**.

These commands save a book's annotations:

- [Generate Notes](generate-notes.md): writes a book's annotations to Obsidian notes.
- [Save Annotations as PDF](save-annotations-as-pdf.md): writes a book's passage selections and notes to a PDF.

These commands convert a book or your Obsidian notes:

- [Save as Markdown](save-as-markdown.md): converts a book's text to Markdown notes.
- [Save as PDF](save-as-pdf.md): converts a book to a PDF, with your marks.
- [Notes to EPUB](notes-to-epub.md): converts Obsidian notes into EPUB books.

When [Reading Records](reading-records.md) is enabled, Orbis Reader writes a vault note for each annotation that you add to a book and keeps them up to date automatically.

---

## Save a book or its annotations

Use this procedure for Generate notes, Save annotations as PDF, Save as Markdown and Save as PDF.

1. Open the book.
2. In the **⋯** menu, select **Generate notes**, **Save annotations as PDF**, **Save as Markdown** or **Save as PDF**.
3. Optional: In the dialog, change the options for this export.
4. Select **Save**.

You can also run each one from the command palette. The commands are listed in the [Command Reference](command-reference.md).

To compare the files that each one writes, see [Which one to use](#which-one-to-use). For the options that the dialogs share, see [What the export dialogs have in common](#what-the-export-dialogs-have-in-common).

---

## Convert notes into an EPUB book

1. In the Files pane, right-click or long-press a Markdown note or a folder.
2. Select one of these:
   - For a note, select **Save note as EPUB**.
   - For a folder, select **Save folder as EPUB** or **Save folder notes as EPUBs**.

To convert the open note, you can also run **Save note as EPUB** from the command palette. For the options, see [Notes to EPUB](notes-to-epub.md).

---

## Which one to use

| To get | Use | What it makes |
|---|---|---|
| Your annotations as Markdown notes in your vault | [Generate Notes](generate-notes.md) | One note, or a book folder with one note for each chapter |
| Notes that follow the book's chapters, for your own notes | [Generate Notes](generate-notes.md) | One note, or a book folder, with a heading for each chapter and no annotations |
| Your annotations as a PDF | [Save Annotations as PDF](save-annotations-as-pdf.md) | A digest of your passage selections and notes, grouped by chapter |
| A vault note for each annotation, updated automatically | [Reading Records](reading-records.md) | One note for each passage selection, annotation note or bookmark |
| The book's text as Markdown | [Save as Markdown](save-as-markdown.md) | Notes that you can link to, search and edit |
| The book as a PDF with your annotations on it | [Save as PDF](save-as-pdf.md) | The book's text, with your marks drawn where you made them |
| Your notes as a book | [Notes to EPUB](notes-to-epub.md) | An EPUB from one note, an EPUB from a folder, or one EPUB for each note in a folder |

Generate notes and Save annotations as PDF write the same annotations in two formats. Save as Markdown and Save as PDF write the same book text in two formats.

---

## Markdown or PDF

Markdown files are notes in your vault. You can link to them, search them and edit them.

A PDF opens in any PDF viewer, with no other software. Use a PDF to send your annotations or the book to another person. Changes made to a PDF do not go back into your notes.

---

## Exports and Reading records

Generate notes, Save annotations as PDF, Save as Markdown, Save as PDF and Notes to EPUB write their files one time. To update the files, run the export again.

Reading records is a setting, not a command. When it is enabled, Orbis Reader writes a note for each annotation and updates the note as you read. To change the reading record settings for the open book, select **Reading record settings** in the **⋯** menu.

---

## What the export dialogs have in common

These rules apply to the dialogs of Generate notes, Save annotations as PDF, Save as Markdown and Save as PDF:

- The dialog opens with the values from your settings. A change in the dialog applies to that export only. It does not change your settings.
- In **Save to**, you can change the folder and the file name.
- If a file or folder with that name already exists, Orbis Reader prompts you before anything is replaced.

The settings for Generate notes, Save annotations as PDF and Reading records are in **Settings → Orbis Reader → Annotations**. The settings for Save as Markdown, Save as PDF and Notes to EPUB are in **Settings → Orbis Reader → Conversions**. All of them are described in the [Settings Reference](settings-reference.md).

---

## When Save annotations as PDF is unavailable

**Save annotations as PDF** is unavailable when the book has no passage selections or annotation notes. Bookmarks do not count. In the **⋯** menu, the item is grayed out. In the command palette, the command is not listed.

Generate notes, Save as Markdown and Save as PDF are always available. Generate notes can outline a book that has no annotations. Save as Markdown and Save as PDF do not need annotations.

---

## Annotations in exports

An annotation is a bookmark, a passage selection or an annotation note. These annotations are included:

- Generate notes includes bookmarks, passage selections and annotation notes. A bookmark is written as a link to its location.
- Save annotations as PDF includes passage selections and annotation notes. It does not include bookmarks.
- Save as PDF draws passage selections and annotation notes on the book's text.
- Reading records writes a note for each annotation type that you select in its settings.

Generate notes, Save annotations as PDF and Save as PDF have **Marks to include**. It limits the export to the passage selections and notes with the marks that you select. To define marks, see [Annotations and Presets](annotations-and-presets.md).

---

## Chapters

Generate notes, Save annotations as PDF, Save as Markdown and Save as PDF use the same definition of a chapter. A chapter is a top-level entry in the book's table of contents, with the headings under it. When you select a chapter, the export includes all of it.

Some top-level entries group other chapters that each have their own file. Examples are a part with its chapters, the novels in an omnibus, and a title heading with every chapter under it. These entries open into their chapters. For example, `Part I` with seven chapters under it gives one row for `Part I` and one row for each of the seven chapters.

---

## See also

- [Generate Notes](generate-notes.md): writes your annotations, or the book's chapter structure, to Obsidian notes
- [Save Annotations as PDF](save-annotations-as-pdf.md): writes your passage selections and notes as a PDF digest
- [Reading Records](reading-records.md): writes one vault note for each annotation and updates it as you read
- [Save as Markdown](save-as-markdown.md): converts the book's text to Markdown notes
- [Save as PDF](save-as-pdf.md): converts the book to a PDF with your marks
- [Notes to EPUB](notes-to-epub.md): converts Obsidian notes into EPUB books
- [Marks and Notes](marks-and-notes.md): describes how to make the annotations that they write
- [Settings Reference](settings-reference.md): lists the default settings for each one
