# Reading Progress

← [User Guide](README.md)

---

## Overview

Orbis Reader saves your reading location in each book and shows your progress in the toolbar.

The Stats tab shows your reading speed, the time remaining and word counts for the open book.

---

## Progress modes

The progress indicator shows one of these modes. When you select it, it moves to the next enabled mode, in this order. 📖 is the book and 📑 is the current chapter.

| Mode | What it shows |
|---|---|
| **📖 Book % complete** | The percentage of the book that you have read |
| **📑 Chapter % complete** | The percentage of the current chapter that you have read |
| **📖 Book locs.** | The current location and the total locations in the book |
| **📑 Chapter locs.** | The current location and the total locations in the chapter |
| **📖 Book time remaining** | The estimated time to finish the book |
| **📑 Chapter time remaining** | The estimated time to finish the current chapter |
| Blank stop | Nothing. The progress indicator is hidden until you select it again |

Until Orbis Reader has your reading speed for the book, a time-remaining mode shows an em dash (—). See [Reading speed](#reading-speed-wpm).

---

## Show a different progress mode

Select the progress indicator in the toolbar. It shows the next enabled mode. You can also run **Cycle reading progress display** from the command palette.

The mode that you select applies to every book that you open on this device. It is not stored for each book. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## Choose the modes in the cycle

1. Go to **Settings → Orbis Reader → Reading behavior → Reading progress indicator**.
2. Enable the modes that you want in the cycle, and disable the others.

At least one mode must stay enabled. When only one mode is enabled, you cannot disable it, and its row shows **The indicator needs at least one mode.**

For the modes and their order in the cycle, see [Progress modes](#progress-modes).

---

## Hide the progress indicator for a short time

Select the progress indicator until it shows nothing. This is the blank stop. To show the progress indicator again, select the empty space where it was.

The blank stop is always in the cycle. You cannot disable it.

---

## Disable the progress indicator

1. Go to **Settings → Orbis Reader → Reading behavior → Reading progress indicator**.
2. Disable **Show reading progress indicator**.

When the progress indicator is disabled, the mode switches are hidden.

---

## Locations

A location is a position number that Orbis Reader calculates for a book. Locations do not match printed page numbers.

Orbis Reader makes the location index in the background the first time you open a book. It saves the index for the next time you open the book.

To go to a location number or a percentage, use the Go to bar. See [Reading a Book](reading-a-book.md).

---

## Reading speed (WPM)

Orbis Reader measures your reading speed in words per minute (WPM). It uses your reading speed to estimate the time remaining, in the progress indicator and on the Stats tab.

Each page that you turn can give one sample: the words on the page and the time that you spent on it. Orbis Reader uses your last 15 samples.

Orbis Reader needs 8 samples before it shows a reading speed or a time remaining.

---

## The Stats tab

The **Stats** tab in the Navigator shows statistics for the open book. The statistics update as you read. To open the tab, run **Open Stats tab** from the command palette.

| Section | What it shows |
|---|---|
| **Reading speed** | Shows **Estimated reading speed** in words per minute, and the number of samples. Before there are 8 samples, it shows **Gathering data…** and a count, such as `(3 / 8 samples)` |
| **Time remaining** | Shows the estimated time to finish **This book** and **This chapter**. The `~` means that the time is approximate. Shows — until your reading speed is known |
| **Progress** | Shows the percentage for the **Book** and the **Chapter**, and the **Location** and **Chapter location**. The location rows show after the location index is made |
| **Word counts** | Shows the approximate **Book total**, **Book remaining** and **This chapter**. Shows after the location index is made |

---

## See where you are on your other devices

1. In the **⋯** menu, select **Show reading data**.
2. In **Reading activity**, find the device.
3. Optional: To open the book at that device's location, select the location in **Last location**.

You can also run **Show reading data for this book** from the command palette.

For how devices share reading locations, see [Reading on more than one device](#reading-on-more-than-one-device).

---

## The book's reading data

The book's reading data is the page that the book's `.orbis` file shows. It shows the same progress figures as the reader.

To open it, select **Show reading data** in the **⋯** menu. You can also select the `.orbis` file in the `!orbis-data` folder.

These parts of the page show your progress:

- **Average reading speed**, beside the **Last read** date.
- **Reading activity**: a row for each device that opened the book, with its **Device**, **Last opened** and **Last location**. Each location is a link that opens the book at that location.

**Reading activity** is available even when the **Device locations** dialog does not open.

The other parts of the page are described in [The .orbis File](orbis-file.md).

---

## How your reading location is saved

Orbis Reader saves your reading location each time you move in the book. When you open the book again, it opens at that location.

Each device has its own reading-location file for each book. This file is a JSON file in the `!orbis-data` folder, in the same folder as the book.

---

## Reading on more than one device

Each device saves its own reading location for a book. Devices do not change each other's reading location.

Your reading speed is stored in the book's `.orbis` file. All your devices share one reading speed for each book.

When you open a book, the **Device locations** dialog can show another device's reading location. See [Sync and Devices](sync-and-devices.md).

---

## Reading status

To mark a book as read, or to put it aside, set its reading status. See [Set the reading status or rating of the book you are reading](library-dashboards.md#set-the-reading-status-or-rating-of-the-book-you-are-reading) in Library Dashboards.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Reading behavior → Reading progress indicator**. They apply only to the device that you set them on. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

| Setting | What it does |
|---|---|
| **Show reading progress indicator** | Shows the progress indicator in the toolbar. When it is disabled, the mode switches are hidden. Enabled by default |
| **📖 Book % complete**, **📑 Chapter % complete**, **📖 Book locs.**, **📑 Chapter locs.**, **📖 Book time remaining**, **📑 Chapter time remaining** | Adds each mode to the cycle when it is enabled. All six are enabled by default. At least one must stay enabled |

---

## See also

- [Reading a Book](reading-a-book.md): describes the toolbar, the Navigator and the Go to bar
- [Sync and Devices](sync-and-devices.md): describes how devices share reading locations
- [The .orbis File](orbis-file.md): describes the `.orbis` file and the rest of the reading data
- [Library Dashboards](library-dashboards.md): describes reading status and rating
- [Settings Reference](settings-reference.md): lists every setting
