# Generate Notes

← [User Guide](README.md)

---

## Overview

**Generate notes** writes a book's bookmarks, passage selections and annotation notes to Obsidian notes: one note, or a book folder with one note for each chapter.

It can also write the book's chapter headings with no annotations, so that you can write your own notes in Obsidian.

The notes are a copy that does not change as you read. For notes that update as you read, use [Reading Records](reading-records.md).

---

## Generate notes for a book

Generate notes to work with a book's annotations in Obsidian: to link them, search them and add your own text.

1. Open the book.
2. In the **⋯** menu, select **Generate notes**.
3. Optional: If you have more than one notes style, select a style in **Notes style**.
4. In **Format**, select **Single Obsidian note** or **Book folder**.
5. Optional: To change the folder or the name, open **Save to** and change them.
6. Optional: To change which annotation types are included, open **Note content**.
7. Optional: To include only some chapters, open **Chapters**. See [Select the chapters](#select-the-chapters).
8. Optional: To include only some marks, open **Marks to include**. See [Include only some marks](#include-only-some-marks).
9. Select **Save**.

You can also run **Generate notes** from the command palette.

The dialog opens with the settings of your default notes style. A change in the dialog applies to this run only. It does not change the notes style.

You can edit, link and search the notes like other Obsidian notes. A change to the notes does not change the annotations in the book.

For what each format writes, see [What the notes contain](#what-the-notes-contain). For the names in **Save to**, see [File and folder names](#file-and-folder-names).

---

## Create an outline for your own notes

Use **Generate notes** to create an outline of a book in your vault. Use it when you want to take your own notes in Obsidian, organized by the book's chapters. Each chapter gets a heading with a link back into the book.

1. Open the book.
2. In the **⋯** menu, select **Generate notes**.
3. Open **Note content**.
4. Disable **Bookmarks**, **Passage selections** and **Notes**.
5. Do one of these:
   - To make a book folder, select **Book folder** in **Format**.
   - To make one note, select **Single Obsidian note** in **Format**, and keep **Chapter headings** enabled.
6. Select **Save**.

A book folder has a contents note and one chapter note for each chapter. Each chapter note has the chapter's heading and an **↗ Open in book** link.

A single note has a heading for each chapter and its subheadings. Each heading has an **↗ Open in book** link.

---

## Save the note outside the vault

Save the notes as one note outside the vault when you want to read or edit them in another app, or send them to someone.

1. Open the book.
2. In the **⋯** menu, select **Generate notes**.
3. In **Format**, select **Single Obsidian note**.
4. Optional: Change the notes style, the content, the chapters or the marks, as in [Generate notes for a book](#generate-notes-for-a-book).
5. Do one of these:
   - On a computer, select **Export…** at the left of the dialog's buttons. In the save dialog, select a folder, then select **Save**.
   - On a phone or tablet, select **Share…** at the left of the dialog's buttons. Then select an app to send the note to.

The note has the name in **File name** under **Save to**. The folder under **Save to** is used only by **Save**.

The note is written to work outside Obsidian:

- Each link into the book becomes its location as text, such as `loc. 42`. The **↗ Open in book** lines are left out.
- The **Contents** list links to each chapter with a standard Markdown link, such as `[Chapter One](#chapter-one)`. Most Markdown editors follow these links.
- The properties stay. The `book` property has the book's file name as text, not a link.
- In the text of your notes, a link to another note becomes its text, and an embedded image or note is left out. A link to a web page stays a link.

Nothing in the vault changes. **File already exists** does not apply, and the note is not one that **Open notes** opens. On a computer, the save dialog asks before it replaces a file. If you cancel the save dialog, the dialog stays open with your choices kept. A notice shows where the note was saved.

On a phone or tablet, Orbis Reader keeps the note in its plugin folder, in `.obsidian/plugins/orbis-reader/share`, until you share another file or Obsidian starts again. On Android, the first list shows the apps that open a Markdown file. To send the note to a person, select Android Share.

**Book folder** makes a note for each chapter and a contents note, so **Export…** and **Share…** show only when **Single Obsidian note** is selected. They show only on a device where Obsidian supports them.

---

## What the notes contain

These sections describe what Generate notes writes in a single note and in a book folder.

### What a single note contains

A single note has these parts, in this order:

1. The properties from the frontmatter template, and the property `orbis_generated`.
2. A heading with the book's title. If the book has no title, the heading is the file name.
3. A **Contents** list with a link to each chapter's heading. The list shows when the note has annotations or chapter headings.
4. A heading for each chapter, with an **↗ Open in book** link on the line under it. The link opens the book at that chapter.
5. Under each chapter, a section for each annotation type: **Bookmarks**, **Passage selections** and **Notes**. The sections are in the order that the notes style sets.

The **↗ Open in book** link is under the heading, not in it. Because of this, a link to a chapter from another note, such as `[[Sample Book Notes#Chapter One]]`, goes to the chapter.

### What a book folder contains

A book folder contains one note for each chapter and a contents note. The contents note is named `000 - {Book Title}.md`. It has an Obsidian base that lists every chapter note in the folder.

Each chapter note has the chapter's heading and an **↗ Open in book** link. Each subheading that has annotations also has the link. Each chapter note also links to the chapter notes before and after it.

Orbis Reader writes these properties in each chapter note:

| Property | What it contains |
|---|---|
| `orbis_generated` | A value that identifies the note as a generated note |
| `chapter` | The chapter's number in the folder. The contents note sorts by it |
| `book` | A link to the book file |
| `book_title` | The book's title as plain text. An Obsidian base can group by it |
| `toc` | A link to the contents note |
| `note_set` | An identifier for the folder's set of notes |
| `has_bookmarks`, `has_passage_selections`, `has_notes` | `true` or `false` for each annotation type in the chapter |
| `prev`, `next` | Links to the chapter notes before and after this one |
| `open_chapter` | A link that opens the book at the chapter |

If the frontmatter template sets one of these properties, that line of the template is not used.

A chapter note's `title` comes from the frontmatter template. With the default template, the title has the book and the chapter, for example `Sample Book: PART I – CHAPTER V Notes`. This makes notes from different books easy to tell apart in a search or a list. It also makes the title different from the chapter note that [Save as Markdown](save-as-markdown.md) writes. If the template has no `title` line, chapter notes have no title.

The contents note's `title` is `Sample Book Notes`, the same as a single note. It also has `book` and `book_title`.

---

## Select the chapters

Select the chapters when you only want notes for part of a book, such as the chapters that you are studying.

1. In the **Generate notes** dialog, open **Chapters**.
2. In the dropdown, select **All *n* chapters** or **Only the *n* with content**.
3. Optional: Check or uncheck chapters in the list.

Each row shows the number of annotations in that chapter. To change all rows, select **Select all**, **Clear** or **Invert**. When you check or uncheck a row, the dropdown shows the number of selected chapters, then **selected below**.

**Only the *n* with content** is available only when at least one annotation type is enabled. **Chapters** shows only when the book has two or more chapters. When no chapters are selected, **Save** is unavailable, and so is **Export…** or **Share…**.

A chapter is a top-level entry in the book's table of contents, with the headings under it. An entry that groups chapters, such as a part or one novel of an omnibus, opens into those chapters. See [Chapters](exporting-and-converting.md#chapters).

---

## Include only some marks

Include only some marks when you only want notes for one kind of annotation, such as only the passages marked **Key point**.

1. In the **Generate notes** dialog, open **Marks to include**.
2. Select **Select marks**.
3. Check the marks to include. To keep the notes that have no mark, check **Unmarked notes**.
4. Select **Done**.

The list shows only the marks that the book uses, with the number of times each one is used. The header of **Marks to include** shows **All marks**, or the names of the marks that you selected.

Bookmarks have no mark. A run limited to some marks still includes every bookmark.

The mark selection applies to this run only. It is not part of the notes style, because each book can use different marks.

If **Passage selections** and **Notes** are both disabled, **Marks to include** is unavailable. It shows this message: *Select passage selections or notes above to filter them by mark.* If no annotation in the book has a mark, **Marks to include** does not show.

---

## Update notes that already exist

Generate notes again after you add or change annotations, to bring the notes up to date.

If notes already exist at the path in **Save to**, the dialog shows **File already exists** or **Folder already exists**, with these options:

| Option | What it does |
|---|---|
| **Merge** | Shows the differences, so that you can combine the existing notes with the new ones. Selected by default |
| **Save as new version** | Writes a new numbered file, or a new numbered folder, beside the existing one |
| **Replace** | Overwrites the existing notes without a review. In a book folder, removes this book's earlier chapter notes from the folder and writes new ones; other notes in the folder stay |

If you select **Replace**, the **Replace existing notes?** dialog prompts you before the notes are overwritten. To stop this prompt, check **Don't warn me about this again**.

To merge a single note:

1. Under **File already exists**, select **Merge**.
2. Select **Save**.
3. In **Merge notes**, select **Keep original** or **Use new version** for each change.
4. Select **Apply**.

To merge a book folder:

1. Under **Folder already exists**, select **Merge**.
2. Select **Save**.
3. In **Merge chapter notes**, select **Review** next to a chapter note.
4. Select **Keep original** or **Use new version** for each change, then select **Apply**.
5. Do steps 3 and 4 again for each chapter note in the list.

In a book folder merge, new chapter notes are added, and unchanged chapter notes are merged automatically. The contents note is updated without a review.

---

## Continue a merge that you closed

If you close a merge before you apply it, Orbis Reader saves a draft. The draft is a file or folder with `-merge-draft` at the end of its name.

1. Run **Generate notes** again with the same path in **Save to**.
2. In the dialog, select **Resume merge**. To delete the draft instead, select **Discard draft**.

The dialog shows *A merge is already in progress.* above the two buttons.

---

## Open the notes for a book

Open the notes from the book to go straight to the notes that you generated for it.

1. Open the book.
2. In the **⋯** menu, select **Open notes**.

You can also run **Open notes** from the command palette.

| Notes for the book | Result |
|---|---|
| None | Opens the **Generate notes** dialog |
| One note or one book folder | Opens the notes |
| More than one, such as a single note and a book folder | Shows a list of the notes. The chapter note for the chapter you are reading is first |

---

## Notes styles

These sections describe how to create a notes style and the templates that set its file names, properties and lines.

### Create a notes style

A notes style is a saved set of Generate notes settings. Create one to use the same settings for many books. You can have more than one, for example one for passage selections only and one for a book folder.

1. Go to **Settings → Orbis Reader → Annotations → Notes styles**.
2. Select the **New** button (plus icon).
3. In **Name**, enter a name for the style.
4. Select **Save**.
5. Change the settings of the new style. The settings are listed in [Options and settings](#options-and-settings).
6. Optional: To open the Generate notes dialog with this style, enable **Set as default**.

To rename the selected style, select the **Rename** button (pencil icon). To delete it, select the **Delete style** button (trashcan icon). You cannot delete the default style or the **Orbis style**.

Notes styles are shared with your other devices. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

### File and folder names

The file name template and the folder name template accept these placeholders: `{{title}}`, `{{author}}`, `{{filename}}`, `{{style}}` and `{{today}}`. The default for both is `{{title}} Notes`.

The chapter file name template accepts `{{index}}`, `{{chapter}}`, `{{title}}` and `{{style}}`. `{{index}}` is the chapter number with three digits, such as `001`. The default is `{{index}} - {{chapter}}`.

These characters cannot be in a file name: `\ / : * ? " < > | # ^ [ ]`. Orbis Reader changes each one to a space. This applies to names from the book's title and to names that you type. The header of **Save to** shows the name that will be written. A name longer than 120 characters is shortened.

### Frontmatter template

The frontmatter template accepts these placeholders: `{{title}}`, `{{subject}}`, `{{author}}`, `{{publisher}}`, `{{publication_date}}`, `{{language}}`, `{{description}}`, `{{filename}}`, `{{book_link}}` and `{{today}}`.

`{{title}}` is always the book's title. `{{subject}}` is what the note is about. In a single note, it is the book's title. In a chapter note, it is the book's title and the chapter's name, with a colon between them. If the chapter's name already contains the book's title, `{{subject}}` is the chapter's name only.

The default template has `title: "{{subject}} Notes"` and `book_title: "{{title}}"`:

| Note | `title` | `book_title` |
|---|---|---|
| Single note | `Sample Book Notes` | `Sample Book` |
| Chapter note | `Sample Book: PART I – CHAPTER V Notes` | `Sample Book` |

Quotation marks and line breaks in a value are escaped, so the frontmatter stays valid.

You can change the frontmatter template only in the notes style. To use the default template again, select **Reset to default** under the template.

### Line templates

Each annotation type has a one-line template: **Passage selection template**, **Note template** and **Bookmark template**. These placeholders are available:

| Placeholder | What it becomes |
|---|---|
| `{{mark}}` | The mark's badge and name, ending in a space: `🟡➖ Follow up: ` |
| `{{mark_badge}}` | The badge only: `🟡➖`. Markdown cannot show a mark's color, so the badge shows the mark |
| `{{mark_name}}` | The name only: `Follow up`. Empty for a mark that has no name |
| `{{selection}}` | The words from the book, on one line |
| `{{selection_block}}` | The same words as a quote block, with a blank line after it. Empty when there is no passage |
| `{{note_text}}` | The text that you typed in the note. Note template only |
| `{{link}}` | A link to the exact location in the book |
| `{{loc}}` | The location number only |
| `{{chapter}}` | The chapter that the annotation is in |
| `{{date}}` | The date you made the annotation, such as `2026-08-03` |
| `{{kind}}` | How the bookmark was made: *reading* or *audio*. Bookmark template only |

The bookmark template accepts only `{{link}}`, `{{loc}}`, `{{chapter}}`, `{{date}}` and `{{kind}}`. A bookmark line does not include the sentence that the bookmark is anchored to.

To remove a part from the line, remove its placeholder. A misspelled placeholder becomes empty text.

Line breaks in a passage are kept as they are in the book.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Annotations → Notes styles**. Each notes style has its own values.

| Setting | What it does |
|---|---|
| **Set as default** | Makes the Generate notes dialog open with this style |
| **Default folder for notes files** | Sets where notes files are saved: **Same folder as the book** or **In the folder specified below**. The default is **Same folder as the book** |
| **Notes folder path** | Sets the folder for notes files. Shown when **Default folder for notes files** is **In the folder specified below** |
| **Save as** | Sets the format: **Single Obsidian note** or **Book folder**. The default is **Single Obsidian note** |
| **File name template** | Sets the name of a single note. Shown for **Single Obsidian note** |
| **Folder name template** | Sets the name of the book folder. Shown for **Book folder** |
| **Chapter file name template** | Sets the name of each chapter note. Shown for **Book folder** |
| **Frontmatter template** | Sets the properties at the top of each note |
| **Chapter headings** | Adds a heading for every chapter, including chapters with no annotations. Annotations are always under their chapter's heading. Shown for **Single Obsidian note** |
| **Bookmarks**, **Passage selections**, **Notes** | Includes each annotation type. The order of the rows sets the order of the sections in a note. To change the order, drag a row or select **Move up** or **Move down** |
| **Passage selection template**, **Note template**, **Bookmark template** | Sets how one annotation of that type is written. To open a template, select **Edit template** on its row |
| **Include chapters without annotations** | Every chapter is selected when the Generate notes dialog opens, not only the ones with annotations. You can change the selection in the dialog. Enabled by default |

In a single note, one of **Chapter headings**, **Bookmarks**, **Passage selections** and **Notes** must stay enabled. The last enabled one shows *At least one content type must stay on.* and cannot be disabled. A book folder has no such limit.

**Include chapters without annotations** shows for a single note only when **Chapter headings** and at least one annotation type are enabled. In a book folder, it shows when at least one annotation type is enabled. With none enabled, the folder has a note for every chapter: an outline to write your own notes in.

---

## See also

- [Exporting and Converting with Orbis Reader](exporting-and-converting.md): compares Generate notes with the other exports
- [Marks and Notes](marks-and-notes.md): describes how to make the annotations that Generate notes writes
- [Annotations and Presets](annotations-and-presets.md): describes marks
- [Reading Records](reading-records.md): writes one note for each annotation and updates it as you read
- [Save Annotations as PDF](save-annotations-as-pdf.md): writes passage selections and notes as a PDF for a person who does not use Obsidian
- [Save as Markdown](save-as-markdown.md): converts the book's text to Markdown notes
- [Settings Reference](settings-reference.md#notes-styles): lists the notes style settings
