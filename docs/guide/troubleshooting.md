# Troubleshooting

← [User Guide](README.md)

---

## Overview

This page lists common problems with Orbis Reader and how to fix them. Each section names a problem, then gives the fix.

---

## A book opens as plain text or as a blank pane

Orbis Reader opens files with these extensions: `.epub`, `.mobi`, `.azw3`, `.cbz` and `.fb2`. Do one of these:

- If you installed Orbis Reader a short time ago, reload Obsidian.
- If another plugin opens the same file extension, open the book file. Then run **Open book** from the command palette.
- If Restricted mode is on, go to **Settings → Community plugins**. Disable Restricted mode, then make sure that Orbis Reader is enabled.

---

## Locations are wrong or missing

The progress indicator shows `—` instead of a location. Or the number of locations is not what you expect, or a location does not match the progress indicator.

- If you opened the book for the first time, wait. Orbis Reader makes the location index in the background the first time a book opens. The progress indicator updates when the index is ready.
- If locations stay wrong after the index is ready, rebuild the location index. See [Rebuild the location index](#rebuild-the-location-index).

The progress indicator shows the location at the top of the page. A page can contain several locations, and more of them when the window is large or the text is small. So the progress indicator and other locations do not always show the same number:

- After you go to a location with the Go to bar, the progress indicator can show a lower number. The Go to bar opens the page that the location starts on, and the top of that page can be in an earlier location.
- A passage selection or note shows the location where the passage begins. A passage lower on the page shows a higher location than the progress indicator.
- A bookmark shows the location where the first lines on the page begin.

The location of a passage selection, note or bookmark comes from the book's text, so it is the same on every device. Only the location at the top of the page changes with the screen and the text size.

Locations do not match the page numbers of a printed book. Orbis Reader calculates locations from the book's text. The Go to bar shows this message: *Locations do not match standard page numbers. Navigation is approximate.*

---

## Rebuild the location index

The command that rebuilds the index is a developer command.

1. Open the book.
2. Run **Toggle developer options** from the command palette.
3. Run **Rebuild location index for current book (dev)**.
4. Optional: Run **Toggle developer options** again to hide the developer commands.

---

## A book does not open at your reading location

Opening a book starts at the beginning, not where you stopped reading.

Orbis Reader stores your reading location in the `!orbis-data` folder beside the book, in your vault.

- If you moved or renamed the book in Obsidian, the files move with it.
- If you moved the book outside Obsidian while Obsidian was open, and the file kept its name, the files move with it.
- If you renamed the book outside Obsidian, or moved it while Obsidian was closed, the files stay in the old folder. Look in the old folder's `!orbis-data` folder, and in the trash, for files with the book's name.
- If you use Obsidian Sync, the `!orbis-data` folder may not be synced yet. Wait for the sync to finish, then open the book again.

---

## The Device locations dialog does not open when you expect it

The **Device locations** dialog opens when you open a book that another device opened more recently. It shows the reading location on each device.

1. On each device, go to **Settings → Orbis Reader → Devices**.
2. Make sure that **Use this vault on more than one device** is enabled.
3. Make sure that **Share reading location with other devices** is enabled.

You set these on each device. See [Sync and Devices](sync-and-devices.md#reading-location-sharing).

The dialog can open only when a book opens. If you read further on another device while the book is open on this device, close the book and open it again.

---

## The Device locations dialog opens too often

Each device must have a different device ID. If you copied a vault instead of syncing it, both copies can have the same device ID.

1. On the copy, go to **Settings → Orbis Reader → Devices**.
2. In **Device name**, enter a different name.

The name lets you tell the devices apart in the **Device locations** dialog.

To stop the dialog on this device, disable **Share reading location with other devices**. You cannot stop it for one book only. If you close the dialog, it can open again the next time you open the book.

---

## Passage selections or notes do not show

Passage selections or notes that you added do not show when you open the book.

- Check the `!orbis-data` folder beside the book for a `.orbis` file with the book's name. This file stores the book's annotations. If the file is missing or damaged, the annotations do not load.
- If you moved the book file a short time ago, the connection to its .orbis file may be broken.
- Go to the annotation's location. Annotations show when their part of the book is displayed.

---

## Annotations are missing after you use another device

Passage selections, notes or bookmarks that you added on one device are missing. Or a change that you made is gone after you work on another device.

- If the other device's changes did not arrive yet, wait for your sync tool. Each device writes its changes to its own file. A book that is open gets the changes when they arrive. A closed book gets them the next time it opens.
- If two devices changed the same annotation while they were not synced, the later change is kept and the other change is lost. For example, you edited the same note on both devices. Make the change again on one device.
- If the book's `.orbis` file was deleted, its annotations are cleared on every device. This includes annotations that a device made offline before the delete. Annotations made after the delete are kept.

See [Sync and Devices](sync-and-devices.md).

---

## On Android, the text selection toolbar covers the marks bar

On Android, when you select a word on the top line of text, Android's text selection toolbar can show over the marks bar. This happens outside Focus mode. The toolbar is Android's own, and Orbis Reader cannot move it.

Do one of these:

- Touch the page just above the toolbar. The toolbar closes and your selection stays.
- Drag a selection handle to select more words. The toolbar closes while you change the selection.
- Drag the toolbar down, away from the marks bar.

When you select text below the first line, the toolbar does not cover the marks bar.

---

## On Android, the selection handles do not show for a word after a quotation mark

When you touch and hold a word that starts with a quotation mark, such as *“We*, Android selects the word without the quotation mark. Orbis Reader adds the quotation mark to the selection, so that a passage selection or note starts with it. When Orbis Reader changes the selection, Android hides its selection handles and its text selection toolbar.

To show the selection handles again, touch the selected text. Then drag a handle to select more words.

---

## Search finds no results for text in the book

A search for text that you can see in the book shows no results.

- Search matches the characters that you type. Check for special characters, dashes (—) and curly quotes ("") that are different from what you typed.
- If **Match case** or **Whole word** is enabled in Advanced search, disable it.
- Try a shorter phrase.

CBZ files contain images, not text. You cannot search a CBZ file.

---

## Generate notes makes a new file instead of updating the existing one

Running **Generate notes** makes `My Book Notes-1.md` instead of updating `My Book Notes.md`. This happens when **Save as new version** is selected in the **Generate notes** dialog.

1. Run **Generate notes** again.
2. In the dialog, select one of these:
   - To review the changes before you apply them, select **Merge**.
   - To overwrite the existing notes file, select **Replace**.

For a book folder, a new version is a new folder with a number, such as `My Book Notes-1`.

If a merge did not finish, the dialog shows **A merge is already in progress.** To continue it, select **Resume merge**. To delete the unfinished merge, select **Discard draft**.

---

## Save annotations as PDF is not available

**Save annotations as PDF** is grayed in the **⋯** menu, and it is not in the command palette.

A digest contains a book's passage selections and annotation notes. A digest does not include bookmarks, so a book with only bookmarks has no digest.

To make the command available, add a passage selection or an annotation note to the book.

To save the book itself as a PDF, with or without your marks, use **Save as PDF**. It is always available.

---

## Save as Markdown is missing images

The exported Markdown links to images, but the image files are empty or missing.

- If **Include images** was not checked, run **Save as Markdown** again with **Include images** checked.
- Some EPUB files encrypt their images. Orbis Reader cannot extract encrypted images.
- If you moved the image files after the export, the links do not find them. For a single Obsidian note, the images are in the `{exportName}-assets` folder. For a book folder, they are in the `{exportName}/assets` folder.

---

## The Stats tab shows "Gathering data…" for a long time

The Stats tab does not show a reading speed, after you read several chapters.

Orbis Reader needs at least 8 samples to estimate your reading speed. It records a sample only when you read. Turning pages quickly does not count.

Read as usual for a few sessions. The Stats tab shows how many samples you have, for example `(3 / 8 samples)`.

---

## Focus mode does not exit

The Obsidian interface does not come back when you try to exit Focus mode.

Press `Ctrl/Cmd+P` to open the command palette, then run **Toggle focus mode**. The command palette hotkey works in Focus mode.

---

## Orbis Reader is not in the list of community plugins

Orbis Reader is not in **Settings → Community plugins**.

1. Make sure that the folder `.obsidian/plugins/orbis-reader/` contains `main.js`, `manifest.json` and `styles.css`.
2. Reload Obsidian.

For the installation steps, see [Getting Started](getting-started.md).

---

## See also

- [Command Reference](command-reference.md): lists every command, including the developer commands
- [Sync and Devices](sync-and-devices.md): describes how annotations and reading locations move between devices
- [Reading Progress](reading-progress.md): describes locations, the progress indicator and reading speed
- [Getting Started](getting-started.md): describes how to install Orbis Reader
