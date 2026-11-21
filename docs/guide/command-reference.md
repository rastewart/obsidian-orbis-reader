# Command Reference

← [User Guide](README.md)

---

## Overview

This page lists every Orbis Reader command in the Obsidian command palette. You can run each command from the palette, and you can give each command a hotkey.

Most commands are for the book that is open in the active pane. The palette shows a command only when it can run.

---

## Run a command

1. Press `Ctrl/Cmd+P` to open the command palette.
2. Type a part of the command name.
3. Select the command.

In the command palette, each command name starts with **Orbis Reader:**.

---

## Set a hotkey for a command

1. Go to **Settings → Hotkeys**.
2. In the search field, type `Orbis Reader`.
3. Next to the command, select **+**.
4. Press the key combination.

A hotkey for a reader command works only when a book is open in the active pane.

---

## Global commands

You can run these commands when no book is open, except where the table gives a condition.

| Command | What it does |
|---|---|
| Open book | Opens the active book file in a new pane. Available when a book file is active |
| Switch display style | Opens a list of your display styles, which you can search. Available when a book is open in any pane |
| Toggle link preview | Enables or disables Link preview on this device. When it is enabled, selecting a link to another place in the book shows a preview first |
| Manage annotation presets… | Opens the **Marks manager** on the **Presets** tab |
| Show pronunciation glossary… | Opens the **Pronunciation glossary** dialog |
| Browse book sources | Opens the list of your OPDS feeds. Available when Book sources is enabled on this device |
| About Orbis Reader | Opens the **About Orbis Reader** dialog, which shows the version and the build |

Link preview works for links to other places in the book, in every book format. A link to a website or another URL shows **Open this link?** instead, whether Link preview is on or off. See [Links that leave the book](reading-a-book.md#links-that-leave-the-book).

---

## Note commands

These commands are available when a Markdown note is active.

| Command | What it does |
|---|---|
| Read in Orbis Reader | Converts the active note into an EPUB and opens it. See [Read in Orbis Reader](read-in-orbis-reader.md) |
| Save note as EPUB… | Opens the dialog that converts the active note into an EPUB |

These two commands are also in the Files pane's context menu for a note. To convert a folder of notes, right-click or long-press the folder in the Files pane. Then select **Save folder as EPUB** or **Save folder notes as EPUBs**. These two items are not in the command palette.

---

## Library commands

These commands are available when Library dashboards is enabled. All of them, except **Open the library** and **Mark this note as a title note**, need an active book file.

| Command | What it does |
|---|---|
| Open the library | Opens the Library view |
| Catalog this book | Makes a title note for the active book. Available when the book has no title note |
| Open title note | Opens the active book's title note beside the book. Available when the book has a title note |
| Set reading status | Opens a dialog to set the reading status of the active book. Makes a title note if the book has none |
| Rate this book | Opens a dialog to set the rating of the active book. Makes a title note if the book has none |
| Take the cover from this book again | Saves the cover image from the book file again. Available when the book has a title note |
| Replace the cover with a generated one | Replaces the book's cover with a cover made from its title and author. Available when the book has a title note |
| Mark this note as a title note | Adds `orbis_note: title` to the active note's properties. Available when the note has a `title` property and is not a library note |

---

## Reader commands

These commands are available only when a book is open in the active pane. They do not show in the command palette when another pane is active.

### Navigation

| Command | What it does |
|---|---|
| Go to next page | Goes to the next page |
| Go to previous page | Goes to the previous page |
| Go to next chapter | Goes to the start of the next chapter in the book's contents |
| Go to previous chapter | Goes to the start of the previous chapter in the book's contents |
| Go back | Goes back to where you were before you followed a link or jumped to a chapter |
| Go forward | Goes forward again after **Go back** |
| Clear navigation history | Clears the book's back and forward history for this session, and hides the back and forward buttons |
| Go to location | Opens the Go to bar, where you enter a location number or a percentage of the book |
| Toggle scrolled mode | Switches between **Paged mode** and **Scrolled mode** |

**Go to location** accepts a location number only after the location index is made. A percentage works at any time.

### Listening

| Command | What it does |
|---|---|
| Toggle listening bar | Opens or closes the listening bar. Opening the bar does not start the audio |
| Toggle full-screen audio player | Opens the full-screen audio player. If the player is open, closes the player and the listening bar |
| Lock listening controls | Locks the controls of the full-screen audio player for Pocket mode. Run it again, or slide the lock up, to unlock. Available while the listening bar or the full-screen audio player is open |
| Choose listening voice… | Opens the **Voice and source** dialog |
| Manage recordings and mixes… | Opens the **Recordings and mixes** dialog for the book |
| Select marks for listening and notes | Opens the **Marks for listening and notes** dialog. It sets the mark that a new note gets, and the mark that the full-screen audio player applies |

The full-screen audio player shows the cover, a progress bar, the chapter skip buttons, and buttons for marks, notes and bookmarks.

### Display

| Command | What it does |
|---|---|
| Increase font size | Increases the font size by 10%, to a maximum of 300% |
| Decrease font size | Decreases the font size by 10%, to a minimum of 80% |
| Increase brightness | Increases the brightness of the book by 10%, to a maximum of 100% |
| Decrease brightness | Decreases the brightness of the book by 10%, to a minimum of 20% |
| Increase line spacing | Increases the line spacing by 0.1, to a maximum of 3.0 |
| Decrease line spacing | Decreases the line spacing by 0.1, to a minimum of 1.0 |
| Increase text margins | Increases the side margins by 1%, to a maximum of 12% |
| Decrease text margins | Decreases the side margins by 1%, to a minimum of 0% |
| Cycle text alignment | Changes the body text alignment to the next value: **Follow the book**, **Left**, then **Justified**. A notice shows the new value |
| Toggle column layout | Switches between one column and the two-column layout. Has no effect in **Scrolled mode** |
| Toggle focus mode | Enables or disables Focus mode. See the next paragraph |

**Cycle text alignment** does the same as **Alignment** in the display style bar.

Focus mode hides the toolbar. On a phone or tablet, it also hides Obsidian's tabs, the header above the book and the mobile navigation bars. The book fills the screen. On a desktop, Obsidian's tabs and header stay. To exit Focus mode, run **Toggle focus mode** again, or select the exit button in the top-right corner.

### Bookmarks and marks

| Command | What it does |
|---|---|
| Toggle bookmark on current location | Adds a bookmark at the current location. If the location has a bookmark, removes it |
| Toggle note icons | Shows or hides the note icons in the right margin |
| Annotation marks for this book… | Opens the **Marks manager** on the **This book** tab |
| Copy link to current location | Copies an `obsidian://orbis-nav` deep link to your reading location. See [Deep Links](deep-links.md) |
| Copy passage selections to clipboard | Copies all passage selections in the book as plain text |
| Copy notes to clipboard | Copies all annotation notes in the book as plain text |
| Copy bookmarks to clipboard | Copies all bookmarks in the book as plain text |

### Navigator

| Command | What it does |
|---|---|
| Open Contents tab | Opens the **Navigator** on the Contents tab |
| Open search | Opens the search bar and puts the cursor in the query field |
| Open Annotations tab | Opens the **Navigator** on the **Annotations** tab, which lists the book's annotations |
| Open Linked vault notes tab | Opens the **Navigator** on the Linked vault notes tab, which lists the vault notes that link to the book |
| Open Stats tab | Opens the **Navigator** on the Stats tab |

### Marking from the keyboard

Use these commands to select and mark text without a pointer. Give each one a hotkey. [Marks and Notes](marks-and-notes.md) shows how they work together.

| Command | What it does |
|---|---|
| Select sentence | Selects the sentence at your reading location and opens the marks bar |
| Select previous sentence | Moves the selection back one sentence |
| Select paragraph | Selects the paragraph at your reading location |
| Extend selection by a sentence | Adds the next sentence to the selection |
| Shrink selection by a sentence | Removes one sentence from the selection |
| Clear selection | Clears the selection and closes the marks bar |
| Apply mark 1 … Apply mark 9 | Applies that mark on the marks bar to the selection, counting from the left |
| Apply no mark (note editor) | Selects **Unmarked** in the note editor, so the note has no mark in the text |
| Go to next mark or note / Go to previous mark or note | Goes to the next or previous passage selection or annotation note, and selects it |
| Go to next passage selection / Go to previous passage selection | Goes to the next or previous passage selection, and selects it |
| Go to next note / Go to previous note | Goes to the next or previous annotation note, and selects it |
| Delete the selected mark or note | Deletes the selected passage selection or annotation note. See the next paragraph |

**Delete the selected mark or note** deletes an annotation that you selected in the book, or that you went to with the commands above. If **Confirm before deleting notes** is enabled, you confirm before an annotation note is deleted. If nothing is selected, a notice shows. Pressing **Delete** or **Backspace** while a passage selection's marks bar or a note's note view is open does the same thing, with no hotkey to set up. See [Mark from the keyboard](marks-and-notes.md#mark-from-the-keyboard).

### Exports

These commands write the book's annotations to other places. See [Exporting and Converting with Orbis Reader](exporting-and-converting.md) to choose one.

| Command | What it does |
|---|---|
| Open notes | Opens the book's notes file. If the book has no notes file, opens the **Generate notes** dialog |
| Generate notes… | Opens the **Generate notes** dialog, where you make or update a notes file. Works on a book with no annotations |
| Save annotations as PDF… | Opens the dialog that writes a digest of the book's passage selections and annotation notes as a PDF. Available when the book has a passage selection or an annotation note |
| Write this book's reading record… | Writes or updates the reading records for all of the book's annotations. Shows how many notes were added and updated |
| Reading record for this book… | Opens the **Reading record settings** dialog for the book |
| Remove records of deleted content… | Opens a dialog that lists the book's reading records whose annotations were deleted, so you can remove them |

A digest does not include bookmarks. If the book has only bookmarks, **Save annotations as PDF** is not in the command palette.

If the book does not use reading records yet, **Write this book's reading record** opens the **Reading record settings** dialog first. If no folder for reading records is set, it prompts you for one.

### Conversions

These commands convert the book itself into another format.

| Command | What it does |
|---|---|
| Save as Markdown… | Opens the dialog that converts the book's text into vault notes: one note, or a folder with one note per chapter |
| Save as PDF… | Opens the dialog that converts the book into a PDF, with your marks shown where you made them. Available for every book. To get a PDF without marks, disable **Include marks and notes** |

### Reading progress

| Command | What it does |
|---|---|
| Cycle reading progress display | Changes the progress indicator to the next enabled mode. After the last mode, the indicator is blank, then the cycle starts again |
| Show reading locations on all devices | Opens the **Device locations** dialog, which shows the reading location of this book on each device |

The progress indicator modes show the book or chapter as a percentage, as locations, or as time remaining.

### Book data

| Command | What it does |
|---|---|
| Show reading data for this book | Opens the reading data of the book's .orbis file: the cover, reading activity, contents, passage selections, notes and linked vault notes |
| Scan annotation data for problems | Opens the **Annotation data check** dialog. It lists passage selections and annotation notes that cannot be shown or gone to, and you can remove them |

**Scan annotation data for problems** finds annotations with a broken range, and exact duplicates.

### Advanced

| Command | What it does |
|---|---|
| Toggle debug log | Shows or hides the debug log over the book |
| Toggle debug button | Shows or hides the debug button over the book. The button is hidden by default |
| Toggle writing the debug log to a note | Starts or stops writing the debug log to a new note for each launch of Obsidian, in the `Orbis debug logs` folder |
| Toggle developer options | Shows or hides developer commands in the command palette, and developer settings |

A debug log note stays in the vault after Obsidian closes, and you can read it on another device. You can run **Toggle debug button**, **Toggle writing the debug log to a note** and **Toggle developer options** when no book is open.

### Developer options

These commands are in the command palette only when developer options are enabled. To enable them, run **Toggle developer options**.

| Command | What it does |
|---|---|
| Recalculate locations (dev) | Changes the location saved with each passage selection, annotation note and bookmark to the location where it begins |
| Rebuild location index for current book (dev) | Deletes the book's location index and makes it again |
| Download test fixtures (dev) | Downloads the test books and notes from this repository's `test-fixtures` release and, after asking, copies the files that differ into the `fixtures` folder |

---

## See also

- [Reading a Book](reading-a-book.md): describes the reader, the toolbar and Focus mode
- [Marks and Notes](marks-and-notes.md): describes how to mark passages and write notes, including from the keyboard
- [Listening](listening.md): describes the listening bar and the full-screen audio player
- [Exporting and Converting with Orbis Reader](exporting-and-converting.md): compares the export and conversion commands
- [Troubleshooting](troubleshooting.md): lists problems and their fixes
