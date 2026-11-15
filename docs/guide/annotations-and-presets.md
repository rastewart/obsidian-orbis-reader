# Annotations and Presets

← [User Guide](README.md)

---

## Overview

A mark is a named appearance that you apply to a passage or an annotation note. A preset is a set of marks that books use. Each book uses a preset by default, or it can use its own marks.

To apply marks while you read, see [Marks and Notes](marks-and-notes.md).

---

## Open the Marks manager

You set up marks and presets in the **Marks manager**. Open it in one of these ways:

- On the toolbar, select **Annotation marks**.
- On the marks bar, select **All marks**, then select **Manage marks**.
- In the **Marks for listening and notes** dialog, select **Manage marks**.
- Run **Annotation marks for this book** from the command palette.
- Run **Manage annotation presets** from the command palette.
- Go to **Settings → Orbis Reader → Annotations**, and select **Manage annotation presets**.

When you open the **Marks manager** from a book, it has two tabs: **This book** and **Presets**. It opens on **This book**. When you open it with **Manage annotation presets**, it shows only the presets.

---

## The Marks manager

Opened from a book, the **Marks manager** has two tabs: **This book** and **Presets**.

### The This book tab

The **This book** tab shows the preset that the open book uses, and the book's marks. A badge on each mark shows where it comes from:

- **Preset**: the mark comes from the preset. When the preset changes, the book changes too.
- **This book**: the mark belongs to the book. It is not part of the preset.

A mark that you add on this tab belongs to the book.

### The Presets tab

The **Presets** tab lists the presets in the vault. Select a preset, then select one of these buttons:

| Button | What it does |
|---|---|
| **Add new** | Creates a preset with the five marks of **Orbis marks** |
| **Duplicate** | Creates a copy of the selected preset |
| **Rename** | Renames the selected preset |
| **Delete** | Deletes the selected preset. Books that use it keep their own copy of each mark, so their annotations do not change |
| **Set as default** | Makes the selected preset the default preset. A book gets the default preset when you first open it |
| **Deactivate**, **Activate** | Removes the selected preset from the lists that you assign a preset from, or adds it back. The preset stays in the vault |

Orbis Reader provides one preset, **Orbis marks**. It has five marks: **Key point**, **Quote**, **Question**, **Definition** and **Disagree**.

You cannot edit, rename, delete or deactivate **Orbis marks**. To change it, select **Duplicate** and change the copy.

Presets are shared with your other devices when Orbis Reader configuration sharing is enabled. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

For what an inactive preset does, see [Active and inactive presets](#active-and-inactive-presets).

---

## Parts of a mark

| Part | What it is |
|---|---|
| **Name** | What the mark means. The name shows on the marks bar, in the **Annotations** tab and in exports |
| Appearance | A highlighter, a treatment, or both. You select a color for each |
| **Badge** | A short text, an emoji by default, that shows the mark where color cannot show, such as in your vault notes |
| **Use for** | The roles of the mark: the mark that new notes get, or the mark that the full-screen audio player applies |

### Appearance

A mark can have a highlighter (a background color), a treatment (a line or shape), or both. Each has its own color. For example, one mark can have a yellow highlighter and a black underline.

The treatments are **Underline**, **Double underline**, **Squiggle**, **Strikethrough** and **Box**. The colors are Yellow, Green, Blue, Orange, Purple, Red, Teal, Brown, Gray and Black. You can also select **Custom** for any hex color value, or **Text color** to match the color of the book's text.

Because a treatment is not only a color, you can tell marks apart when colors are hard to see. Examples are a dim screen, a sepia reader theme or color blindness.

A mark must have a highlighter, a treatment or both. You cannot save a mark without one.

In a book or a preset, no two marks can have the same color and treatment. If you try, this message shows: *"Another mark already uses that color and treatment. Change one of the two so they can be told apart."* In the color list, a color that another mark uses shows **already used**. See [When two marks have the same appearance](#when-two-marks-have-the-same-appearance).

No two marks can have the same name. If you try, this message shows, for example: *"Another mark is already named “Question”. Give this one a different name."* The name then changes back. Names that differ only in capitalization, such as *question* and *Question*, count as the same name. See [When two marks have the same name](#when-two-marks-have-the-same-name).

### Badges

A badge is an emoji by default. Short abbreviations, such as `WIP`, also work. The badge shows the mark in places that cannot show color, such as the notes from [Generate Notes](generate-notes.md).

The default badge changes when you change the mark's color and treatment. When you type your own badge, it no longer changes. To get the default badge back, clear the field and apply.

### Roles

A mark can have one or both of two roles. A role applies the mark automatically. Set the roles in **Use for** in the mark editor:

- **Notes**: new notes get this mark by default.
- **Mark the passage**: passages that you mark in the full-screen audio player get this mark.

In **Orbis marks**, both roles belong to *Key point*. Each role belongs to one mark at a time. When you give a role to a mark, the mark that had it loses it.

A book gets its roles from its preset. When you change a role on the **This book** tab, only that book changes.

You can also set the roles in the **Marks for listening and notes** dialog. See [Select the marks for listening and notes](#select-the-marks-for-listening-and-notes).

### Mark order

The marks bar shows the marks in the order of the list. Only the first marks fit on the bar, so put the marks that you use most at the top.

---

## Add a mark

1. Open the **Marks manager**.
2. Select the **This book** tab, or select a preset on the **Presets** tab.
3. Select **Add mark**. The mark editor opens.
4. In **Name**, type what the mark means.
5. Optional: On the **Appearance** tab, change the highlighter and the treatment.
6. Select **Done**.

A new mark gets an appearance that no other mark in the list uses.

For the highlighters, treatments and colors, see [Appearance](#appearance).

---

## Change a mark

1. Open the **Marks manager**.
2. Select the mark in the list. The mark editor opens.
3. On the **General** tab, change the **Name**, the **Badge** or **Use for**.
4. On the **Appearance** tab, change the highlighter and the treatment.
5. Select **Done**.

Your changes are saved as you make them. When you change a mark's appearance, every passage with that mark changes too.

To change the order of the marks, drag a mark to a new place in the list. You can also select **Move up** or **Move down**.

For the **Badge**, see [Badges](#badges). For **Use for**, see [Roles](#roles). For why the order matters, see [Mark order](#mark-order).

---

## Delete a mark

1. Open the **Marks manager**.
2. Select **Delete this mark** (the trashcan icon) on the mark's row.
3. On the **This book** tab, if annotations use the mark, select one of these:
   - **Apply another mark**: in **Apply**, select a mark from the book's marks. The annotations move to it and get its appearance. No annotations are deleted.
   - **Delete the passage selections, keep the notes**: the passage selections with the mark are deleted. The notes keep their text but lose the mark.
4. Select **Delete**.

If the book has no other mark to apply, the dialog shows only the second result.

On the **This book** tab, you can delete only the book's own marks. To remove a preset mark from one book, [deactivate it](#deactivate-a-mark-for-one-book).

On the **Presets** tab, deleting a mark removes it from the preset for every book. A book with annotations that use the mark keeps it as its own mark, with the badge **This book**. The annotations keep the mark's name and appearance. Books that do not use the mark lose it from their list.

---

## Rules for deleting marks

A passage selection is never left without a mark. These marks cannot be deleted:

- The last mark in a list.
- In a book, the last active mark.

When you delete a mark of the book's own, its appearance becomes free. If that mark kept a preset mark out of the book, the preset's mark is added to the book. When you use **Apply another mark** on a mark with a **`*`**, the preset's mark that it kept out is first in the list.

---

## Change a preset mark for one book

You cannot edit a preset mark on the **This book** tab. Copy it to the book first.

1. On the **This book** tab, select the preset mark. The mark editor shows *"Preset marks can't be edited here. Copying makes this book its own version."*
2. Select **Copy to this book**.
3. Change the mark.
4. Select **Done**.

The copy replaces the preset's mark in the list, with the badge **This book**. The annotations that have the mark move to the copy.

---

## Deactivate a mark for one book

Deactivate a mark when the book's preset has a mark that you do not plan to use in this book. A deactivated mark does not show on the marks bar or in the list of marks, and you cannot apply it.

1. On the **This book** tab, find the mark.
2. Uncheck **Active**.

The mark is deactivated only in this book. Passages and notes that already have the mark keep its appearance and its name. To use the mark again, check **Active**.

A book needs at least one active mark, so you cannot deactivate the last one. You cannot delete a preset mark on the **This book** tab.

---

## Select the marks for listening and notes

1. Open the **Marks for listening and notes** dialog in one of these ways:
   - In the full-screen audio player, select **Marks for listening and notes**.
   - Run **Select marks for listening and notes** from the command palette.
2. In **Passage selections**, select the mark that **Mark the passage** applies in the full-screen audio player.
3. In **Notes**, select the mark that new annotation notes get. To give new notes no mark, select **Unmarked**.
4. Select **Done**.

Your choices are saved as you make them. They apply to the book that is open. They are the same as the two roles in **Use for**. See [Roles](#roles).

---

## Save a book's marks as a new preset

Save a book's marks as a new preset when you added or changed marks in one book and want to use the same marks in other books.

1. On the **This book** tab, select **Save as new preset**.
2. Type a name for the preset.
3. Select **Save**.

The new preset is added to the vault, and the book then uses it. The preset has all the book's marks, including the marks that you added to this book and the marks that are deactivated. To use the preset in another book, see [Change a book's preset](#change-a-books-preset).

---

## Change a book's preset

Change a book's preset when you want the book to use a different set of marks, such as a preset that you made for this kind of book. You decide what happens to the annotations that you already made.

1. On the **This book** tab, select **Change preset**. The **Change this book's preset** dialog opens.
2. In **Change to**, select the preset.
3. For each mark that is listed, select one of these:
   - **Keep in this book**: the mark stays with its name and appearance, with the badge **This book**. Its annotations do not change.
   - A mark from the new preset: the annotations move to that mark and get its appearance. Use this when the new preset has a mark with the same meaning.
4. Select **Apply**.

The dialog lists each mark that has annotations in the book, with the number of annotations. The list includes marks from the old preset and the book's own marks. Nothing changes until you select **Apply**.

If no mark in the book has annotations, the book changes preset without the list. If the vault has only one preset, the dialog shows *"There is only one preset in this vault. Add or duplicate one first."*

---

## When you change a preset

These sections describe what happens to the book's marks when its preset changes.

### When two marks have the same appearance

Two marks in a book cannot have the same appearance: the same highlighter color, the same treatment and the same treatment color. When you change preset, a mark of the book's own can have the same appearance as a mark in the new preset. Then only one of the two can stay.

The **Change this book's preset** dialog shows this before anything changes. The mark's row shows a line that names the two marks, for example *"“Stuff I hate” and “Stuff I love” have the same appearance."* Use the dropdown on that row to select what happens:

| Option | Result |
|---|---|
| **Keep in this book** (the default) | The book's mark stays, and the preset's mark is not added. The annotations do not change |
| A mark from the preset | The book's mark is removed. Its annotations move to the mark that you select and get its appearance. You can select any mark in the preset |

**Keep in this book** is the default because two marks with the same appearance can have different meanings.

In these cases, the dialog does not show a row for the mark:

- **The book's mark has no annotations.** The preset's mark replaces it. The name of the book's mark is lost.
- **The two marks are the same**: same name, same badge, and both active. The preset's mark replaces it, and nothing in the book changes. This happens when you change to a copy of the preset that the book uses.

### When two marks have the same name

Two marks in a book cannot have the same name, because exports show a mark by its name and badge. Two marks named *Question* would look like one mark in a generated note.

When the new preset has a mark with the same name as one of the book's marks, but a different appearance:

- **If the book's mark has no annotations**, the preset's mark replaces it.
- **If the book's mark came from the old preset and has annotations**, its annotations move to the preset's mark with that name. They get its appearance. The dialog does not show a row for this mark.
- **If you made the book's mark for this book and it has annotations**, its row starts on the preset's mark with that name. If you select **Keep in this book**, the book's mark stays and is renamed *Question (this book)*. The line under the row shows the new name before you apply. If the two marks had the same badge, the book's mark gets the default badge for its appearance.

A mark of the book's own also keeps a preset mark with the same name out of the book. See [Get the preset's mark later](#get-the-presets-mark-later).

### Get the preset's mark later

On the **This book** tab, a **`*`** shows a mark of the book's own that keeps a preset mark out of the book. This line shows under the list:

> \* A mark from the preset has the same appearance or name, so it is not added to this book. Change its appearance or name to bring the preset’s mark in.

To add the preset's mark to the book, give the book's mark a different color, treatment or name, or delete it. The preset's mark is then added to the book.

The same rule applies when a preset that the book uses gets a new or changed mark. The book's own mark keeps its appearance, and the preset's mark is not added. The **`*`** shows which mark keeps the preset's mark out.

---

## Stop using a preset

Stop using a preset when a book's marks are very different from its preset, or to keep the book's marks as they are now when the preset changes.

1. On the **This book** tab, select **Stop using this preset**.
2. In the dialog, select **Stop using it**.

After this, the book uses its own marks:

- Every mark from the preset is copied into the book, with the badge **This book**. The marks bar looks the same as before.
- The annotations in the book use the copies. They keep their names, colors and notes.
- Changes to the preset no longer change this book. For example, if you rename a mark in the preset, this book keeps the old name.
- No other book changes. The preset does not change.

The **This book** tab then shows *"This book uses its own marks."* Orbis Reader stores this choice in the book's [.orbis file](orbis-file.md), so it stays when you close the book and when you sync.

---

## Use a preset again

Use a preset again when a book that uses its own marks should follow a preset, for example to get the changes that you make to the preset. You decide what happens to the book's own marks and their annotations.

1. On the **This book** tab, select **Use a preset**.
2. Do steps 2 to 4 of [Change a book's preset](#change-a-books-preset).

---

## Active and inactive presets

An inactive preset is not listed when you assign a preset to a book. It still works in every book that already uses it.

When you open a book whose preset is not in the vault, the preset is added to the vault as inactive. A book that has [stopped using a preset](#stop-using-a-preset) does not add a preset.

You cannot deactivate the default preset. Make another preset the default first. When you make an inactive preset the default, it becomes active.

To remove a preset from the list that you assign from, deactivate it. Do not delete it. The books that use a deleted preset keep a copy of every mark. When you open one of these books, the preset is added back to the list as inactive.

Deleting a preset does not disconnect it from the books that use it. To make a book keep its marks permanently, [stop using the preset](#stop-using-a-preset) in that book first.

---

## Options and settings

| Setting | What it does |
|---|---|
| **Settings → Orbis Reader → Annotations → Manage annotation presets** | Opens the **Marks manager** with only the **Presets** tab |

---

## See also

- [Marks and Notes](marks-and-notes.md): describes how to apply marks while you read
- [Generate Notes](generate-notes.md): writes your annotations, with each mark's badge and name, to Obsidian notes
- [Save Annotations as PDF](save-annotations-as-pdf.md): writes a PDF with a legend that shows what each mark means
- [The .orbis File](orbis-file.md): describes the file where a book's own marks are stored
- [Sync and Devices](sync-and-devices.md#settings-shared-between-devices): describes how presets get to your other devices
- [Settings Reference](settings-reference.md#annotations): lists every setting on the **Annotations** page
