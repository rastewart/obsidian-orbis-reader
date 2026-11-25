# Reading a Book

← [User Guide](README.md)

---

## Overview

To open a book, select it in the Files pane. The book opens in a pane, like any other file in Obsidian.

This page describes the reader: the toolbar, the ways to move through a book, the Navigator, the image viewer and Focus mode.

For what you can do in a book, see [Marks and Notes](marks-and-notes.md), [Look-up](look-up.md), [Search](search.md), [Listening](listening.md) and [Exporting and Converting with Orbis Reader](exporting-and-converting.md).

---

## The toolbar

The toolbar is at the top of the reader. To hide a button, go to **Settings → Orbis Reader → Appearance → Toolbar**.

| Button | What it does |
|---|---|
| **Navigator** (☰) | Opens the [Navigator](#the-navigator) on the left |
| **Search in book** | Opens the search bar. See [Search](search.md) |
| **Bookmark this location** | Creates a bookmark, anchored to the sentence at the top of the page. If the page has a bookmark, the button removes it |
| **Listen** | Opens the listening bar. See [Listening](listening.md) |
| Progress indicator | Shows your progress, in the middle of the toolbar. Select it to change what it shows. See [Reading Progress](reading-progress.md) |
| **Toggle note icons** | Shows or hides the note icon beside each annotation note, in the margin or between two columns |
| **Display style** | Opens the display style bar, for fonts, reader theme, size and layout. See [Display Settings](display-settings.md) |
| **Annotation marks** | Opens the **Marks manager** for this book. See [Annotations and Presets](annotations-and-presets.md) |
| **Focus mode** | Hides the toolbar. See [Focus mode](#focus-mode) |

On a phone or tablet, start a swipe on the toolbar to open Obsidian's side panels or command palette, not on a bar under it.

---

## The ⋯ menu

The pane's **⋯** menu has commands for the whole book. The commands are in five groups:

| Group | Commands |
|---|---|
| The book's data | **Show reading data** |
| Library | **Open title note** or **Catalog this book**, **Set reading status…**, **Rate this book…** |
| Listening | **Manage recordings and mixes…** |
| Annotations | **Open notes**, **Generate notes…**, **Save annotations as PDF…**, **Reading record settings…** |
| Conversions | **Save as Markdown…**, **Save as PDF…** |

The Library group shows only when [Library Dashboards](library-dashboards.md) is enabled. If the book has a title note, the menu shows **Open title note**. If it does not, the menu shows **Catalog this book**.

**Save annotations as PDF** is not available until the book has a passage selection or an annotation note.

---

## Using the toolbar from the keyboard

The toolbar and the bars under it work as rows. The bars are the display style bar, the search bar, the Go to bar and the listening bar.

When a row has the keyboard focus, the arrow keys move between controls. They do not turn the page.

- Left and right arrows move along a row.
- Up and down arrows move between rows.
- Home and End move to the ends of a row.
- In a slider, a number field or a dropdown, the arrow keys change the control. Press Tab to move to the next control.
- Escape moves the keyboard focus back to the book.

When you select a toolbar button, the keyboard focus goes back to the book, and the arrow keys turn pages. When you press Enter or Space on a button, the keyboard focus stays on the toolbar.

---

## Turn pages

- To turn a page, select the left or right edge of the page. The ‹ and › arrows show where to select.
- On a touch screen, you can also swipe. In a CBZ book or a fixed-layout EPUB that reads right to left, such as manga, a swipe turns the page in the book's own direction.
- On a keyboard, press the left or right arrow, Space, Page Up or Page Down.

To slide the page across as it turns, set **Page turn** to **Slide** on the **Layout** tab of the display style bar. See [Display Settings](display-settings.md#options-and-settings).

To read the book as one long scroll, see [Paged mode and Scrolled mode](#paged-mode-and-scrolled-mode).

---

## Go to a chapter

1. On the toolbar, select the **Navigator** button (☰). You can also run **Open Contents tab** from the command palette.
2. If the **Contents** tab is not open, select it.
3. Select a chapter or section.

The book goes to that place, and the Navigator closes.

To go to the next or previous chapter, run **Go to next chapter** or **Go to previous chapter** from the command palette. You can assign a hotkey to each of these commands.

For more about the Contents tab, see [The Contents tab](#the-contents-tab). For the Navigator's other tabs and how to close it, see [The Navigator](#the-navigator).

---

## Go to a location or a percentage

1. Run **Go to location** from the command palette.
2. In the Go to bar, type a location number or a percentage, for example `47` or `34%`.
3. Select **Go**.

The Go to bar shows this message: *Locations do not match standard page numbers. Navigation is approximate.*

The Go to bar uses the book's location index. Orbis Reader makes the location index the first time you open a book.

---

## Go back after a jump

A jump is any move to another place in the book other than a page turn. For example: another chapter, a footnote, a search result, a bookmark, or **Go to location**.

1. After a jump, select the back button (**←**) in the top-right corner of the page.
2. Optional: To go forward again, select the forward button (**→**).

You can also run **Go back** and **Go forward** from the command palette.

For when the buttons show, see [Back and forward buttons](#back-and-forward-buttons).

---

## Follow a link in the book

1. Select a link, such as a footnote or a cross-reference.
2. If **Link preview** is enabled, a preview of the destination opens. To go to the destination, select **Go**.

With a preview, you can read a footnote and stay where you are in the book. If **Link preview** is disabled, the book goes to the destination when you select the link.

### Links that leave the book

When you select a link to a website, an email address or another app, **Open this link?** opens first. It shows:

- **Link type**: what the link opens, such as *Web page*, *Email*, *Phone number*, *Obsidian link* or *File on this device*.
- **Domain**: for a web page, the site; for an email, the part after `@`. Other links have no domain.
- **Link text**: the words of the link, as the book shows them.
- **Link address**: the whole address, as it will be opened, wrapped to fit. The domain is in bold.

**Link text** and **Link address** are in a code font on a shaded background, so you can compare them letter by letter.

When a link could mislead you about where it goes, an orange line under the row it concerns says how. For example:

- The link text names one site, and the link address goes to another.
- The domain has a character from another alphabet, such as a Cyrillic letter that looks like a Latin one. The domain then shows in its encoded form, which starts with `xn--`, and the orange line names the character.
- The link address has a name before `@`. The domain is the part after it.

These lines state facts. Many such links are harmless, such as a publisher's short web address. When there is a difference, the dialog says *This link may be unsafe. Open it only if you trust the book's source.* above the buttons, and **Open** turns red.

Characters you can't see in the book, such as one that reverses the direction of text, show in **Link text** as their code, such as `[U+202E]`, with a grey note that explains it. In a link address, the browser removes or encodes them, so **Link address** shows the address as it will be opened. These don't change where the link goes, so they don't turn **Open** red.

A link whose address no browser can open, such as one with a space in its domain, shows *Not a valid address* as its **Link type**. The dialog says *This address can't be opened.* above the buttons, and offers only **Cancel**.

To copy the address without opening it, select the copy button beside **Link address**. To leave the link closed, select **Cancel** or press Escape.

This check can't be turned off, and **Link preview** doesn't change it. Links to another place in the book, and links between the books of a converted set, open without it.

Orbis Reader doesn't open a link that runs a script. When you select one, a notice says so.

---

## Look at an image

1. Select an image in the book. The image viewer opens with the image fitted to the reader.
2. Optional: Zoom in. To zoom, pinch, scroll, or use a trackpad pinch.
3. Optional: To copy the image, select **Copy image**.
4. To close the image viewer, select the Close button or press Escape.

When you paste the copied image into a note, Obsidian saves it in your attachment folder, like any other pasted image. See [The image viewer](#the-image-viewer) for all the controls.

---

## Read in Focus mode

1. On the toolbar, select the **Focus mode** button. You can also run **Toggle focus mode** from the command palette.
2. To exit Focus mode, select the exit button in the top-right corner, or run **Toggle focus mode** again.

For what Focus mode hides on each device, see [Focus mode](#focus-mode).

---

## Paged mode and Scrolled mode

**Paged mode** is the default. It shows the book as screen-sized pages.

**Scrolled mode** shows the current section of the book as one long scroll. To change the mode, use the **Layout** tab of the display style bar. You can also run **Toggle scrolled mode** from the command palette.

**Two-column layout** is available only in Paged mode. When it is enabled, and the screen is big enough, each page shows two columns. Its switch is hidden in Scrolled mode. See [Display Settings](display-settings.md).

---

## The Navigator

The Navigator opens on the left of the reader. To open it, select the **Navigator** button (☰). You can also run a command that opens one of its tabs: **Open Contents tab**, **Open Annotations tab**, **Open Linked vault notes tab** or **Open Stats tab**.

To close the Navigator, do one of these:

- Select the page beside it.
- Select the **Navigator** button again.
- Press Escape.
- Select an item in it to go there.

The Navigator has five tabs:

| Tab | What it shows |
|---|---|
| **Contents** | Shows the book's table of contents. See [The Contents tab](#the-contents-tab) |
| **Search** | Shows full-text search of the book. See [Search](search.md) |
| **Annotations** | Lists your bookmarks, passage selections and annotation notes. See [Marks and Notes](marks-and-notes.md) |
| **Linked vault notes** | Lists the notes in your vault that link to this book. See [The .orbis File](orbis-file.md) |
| **Stats** | Shows reading speed, time remaining and word counts. See [Reading Progress](reading-progress.md) |

### The Contents tab

The Contents tab shows the book's table of contents. Indents show the levels: chapter, section and subsection.

The entry for the current chapter is highlighted. The highlight moves when you turn a page.

The tab opens scrolled to the highlighted entry, in the middle of the list. On the pages before the first entry, such as a cover, the first entry is highlighted.

If the book has no table of contents, the tab shows **No table of contents**. See [Format Support](format-support.md).

---

## Back and forward buttons

The back button (**←**) shows in the top-right corner of the page after a jump. The forward button (**→**) shows after you go back. They work like the back and forward buttons of a web browser.

A page turn does not add a place to go back to. Only a jump does.

The buttons show only when there is a place to go back or forward to. They are not on the toolbar, and no setting changes them.

---

## The image viewer

The image viewer opens an image over the page, so you can see detail that is too small in the column.

| Control | What it does |
|---|---|
| Select an image | Opens the image, fitted to the reader |
| Pinch, scroll, or trackpad pinch | Zooms, up to 8× |
| Drag | Moves the image when it is zoomed in |
| Double-tap or double-click | Zooms in on that point. Do it again to fit the image to the reader |
| Single tap or click | Fits the image to the reader if it is zoomed in. Closes the viewer if it is not |
| **Copy image** | Copies the image, to paste into a note or another app |
| Close button or Escape | Closes the image viewer |

The **Copy image** button is to the left of the Close button. It copies the book's image as a PNG, at full size and full brightness.

While the image viewer is open, the back and forward buttons are hidden, and the keys that turn pages don't turn the page behind it. Going to another place in the book, from the Navigator, a link, search or a bookmark, closes the image viewer.

If the image has alt text, the alt text shows at the bottom. It is hidden when you zoom in.

An image inside a link does not open in the image viewer. Selecting it follows the link. All other images open, including icons and small inline images.

The image viewer uses the book's background and brightness, not Obsidian's.

---

## Focus mode

Focus mode hides the Orbis Reader toolbar and gives the book more space. What else it hides depends on the device:

- **On a phone or tablet**, the book fills the screen. Focus mode also hides Obsidian's tabs, the header above the book, the mobile toolbars and the status bar with the clock and battery.
- **On a desktop**, Focus mode hides only the Orbis Reader toolbar. Obsidian's tabs, sidebars and the header above the book stay. You can go to another tab and come back, and the book is still in Focus mode.

These controls stay on the screen, over the page:

- The exit button, in the top-right corner.
- The back and forward buttons, beside the exit button, after a jump.
- The progress indicator, at the bottom in the middle. Select it to change what it shows.

All other features work in Focus mode. You can select text, apply marks, write notes, search and listen. If the search bar or the listening bar is open when you start Focus mode, it stays open.

On a phone, the marks bar opens at the bottom of the screen in Focus mode. When you start or exit Focus mode, the text selection is cleared and the marks bar closes.

---

## Getting back to a book

Orbis Reader saves your reading location while you read. When you open the book again, it opens at that location.

Each device saves its own reading location, so two devices do not overwrite each other's location. If another device opened the book more recently, the **Device locations** dialog opens when you open the book. Select a device to go to its reading location. See [Sync and Devices](sync-and-devices.md#go-to-your-reading-location-from-another-device).

To find a book again, use one of these:

- The Files pane. A book is a file in your vault.
- Obsidian's quick switcher.
- The **Recently opened titles** widget on the **Library** dashboard, if [Library Dashboards](library-dashboards.md) is enabled.

The **Recently opened titles** widget shows the ten titles you opened last, most recent first. To see the others, select **Show all**. The widget lists only books that have a title note, so catalog a book to add it.

The **Library** dashboard is read-only. To change the list, for example to remove finished books, copy the dashboard. Then set the widget to a collection that you make. See [Library Dashboards](library-dashboards.md).

---

## Options and settings

These settings are in **Settings → Orbis Reader → Reading behavior**.

| Setting | What it does |
|---|---|
| **Turn pages with the keyboard** | Turns pages with the left and right arrows, Space and Page Up/Down. When it is disabled, these keys are free for other hotkeys. Other hotkeys do not change. Enabled by default |
| **Show page arrows** | Shows the ‹ and › arrows at the edges of the page. When it is disabled, selecting an edge still turns the page. Enabled by default |
| **Flash book text for navigation and search results** | Flashes the passage that a search result, a bookmark or a link goes to. Enabled by default |
| **Link preview** | Shows a preview of a link's destination before you go to it. Enabled by default |
| **How the book opens** | Sets the reading mode that a book opens in. It is under the **Opening a book** heading on this settings page |
| **Open with** | Sets the bar that opens under the toolbar when a book opens. It is under the **Opening a book** heading on this settings page |

For the options of **How the book opens** and **Open with**, see [Opening a book](settings-reference.md#opening-a-book) in the Settings Reference.

The toolbar buttons are in **Settings → Orbis Reader → Appearance → Toolbar**.

These settings apply only to the device that you set them on. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## See also

- [Display Settings](display-settings.md): describes fonts, reader themes, layout and display styles
- [Marks and Notes](marks-and-notes.md): describes passage selections, annotation notes and bookmarks
- [Search](search.md): describes full-text search of the book
- [Reading Progress](reading-progress.md): describes the progress indicator, locations and reading stats
- [Format Support](format-support.md): describes what works in EPUB, MOBI, AZW3, FB2 and CBZ
- [Deep Links](deep-links.md): describes links that open a book at a location
- [Command Reference](command-reference.md): lists every command, including the navigation commands
- [Settings Reference](settings-reference.md#reading-behavior): lists every setting on the **Reading behavior** page
