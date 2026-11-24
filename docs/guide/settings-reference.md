# Settings Reference

← [User Guide](README.md)

---

## Overview

This page lists every Orbis Reader setting, page by page. The settings are in **Settings → Orbis Reader**.

---

## Open the settings

1. Open Obsidian's settings.
2. Under **Community plugins**, select **Orbis Reader**.

You can also select the button with the gear icon next to Orbis Reader in the list of installed community plugins.

---

## Find a setting

1. Open Obsidian's settings.
2. In the search field at the top of the settings window, type the name of the setting.

The results include the matching Orbis Reader settings.

---

## Settings pages

The Orbis Reader settings open on a list of ten pages. Each row describes what its page contains. The last row shows the version of the plugin. Its **User guide** button opens this guide in your browser.

| Page | What it contains |
|---|---|
| [Setup](#setup) | The tasks that enable each feature, with a count of the tasks that are done |
| [Appearance](#appearance) | How books look, and the buttons on the reader's toolbar |
| [Reading behavior](#reading-behavior) | How the reader behaves while you read, and the progress indicator |
| [Listening](#listening) | Voices, playback, the full-screen audio player and the pronunciation glossary |
| [Annotations](#annotations) | Marks, reading records, and saving annotations as Markdown or PDF |
| [Look-up](#look-up) | Offline dictionaries, the sections of the Look-up dialog, and search destinations |
| [Library dashboards](#library-dashboards) | Title notes, covers, dashboards, collections and properties |
| [Book sources](#book-sources) | OPDS feeds and the folder for downloaded books |
| [Conversions](#conversions) | Converting books and Obsidian notes to Markdown, PDF and EPUB |
| [Devices](#devices) | Using the same vault on more than one device |

Features such as Library dashboards, Reading records and Listening are optional. You can read books when none of them is enabled. To enable a feature, use the **Setup** page.

Some settings are shared with your other devices, and some apply only to the device you set them on. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## Setup

The **Setup** page lists the features that you can enable, with one task for each feature. On the main settings page, the **Setup** row shows how many tasks are done, for example "3 of 7".

At the top of the page are **Reader theme**, **Font size** and **Preview** from the **Appearance** page. They change the display style that is in use, so that you can make the text easy to read first.

| Task | Button | What it does |
|---|---|---|
| **Book sources** | **Set up** | Enables book sources and prompts you for the folder for downloaded books |
| **Look-up** | **Download** | Downloads the offline dictionaries |
| **Library dashboards** | **Set up** | Enables the library and prompts you for the folders for title notes and covers |
| **Reading records** | **Set up** | Enables reading records and prompts you for their folder |
| **Listening** | **Choose** | Opens a dialog where you preview and select a voice for this device |
| **Expanded PDF character set** | **Download** | Downloads the fonts that PDFs need to show more than about 220 characters |
| **Devices** | **Set up** | Opens a dialog where you name this device and select what it shares with your other devices |

Each task has a description. A task that downloads something shows its size. When a task is done, it shows **Ready**.

If Orbis Reader configuration sharing is enabled, the **Library dashboards** and **Reading records** tasks show **Ready** on your other devices. You do the other tasks on each device.

---

## Appearance

These settings are in **Settings → Orbis Reader → Appearance**. They change how books look, and the buttons on the reader's toolbar.

Most settings on this page change the display style that is selected in **Display style**. For example, if the display style *Night* is selected and you change the font, you change *Night*. See [Display Settings](display-settings.md).

| Setting | What it does |
|---|---|
| **Toolbar** | Opens the [Toolbar](#toolbar) page |
| **Reader theme manager** | Opens a page where you select which reader themes the **Reader theme** dropdown lists, set their order, and make your own. See [Display Settings](display-settings.md) |
| **Tooltip distance** | Sets how far Orbis Reader's tooltips show below a control. The minimum is Obsidian's own distance. Increase it if a large pointer covers the text of a tooltip. To check the distance, hover over **Sample**. Obsidian's own tooltips do not change. Shown on desktop only |
| **Display style** | Selects the display style that you edit. Also creates, renames and deletes display styles |
| **Reader theme** | Sets the colors of books. The options are **Match light or dark mode**, **Match Obsidian's theme**, and the reader themes that are enabled in the **Reader theme manager** |
| **Brightness** | Dims the page without changing the brightness of your screen, from 20% to 100% |
| **Reading mode** | Sets **Paged mode** or **Scrolled mode** |
| **Two-column layout** | Shows two columns when the window is wide enough. Hidden in **Scrolled mode** |
| **Text margins** | Sets the space around book text, from 0% to 12% |
| **Line spacing** | Sets the space between lines, from 1.0× to 3.0× |
| **Text alignment** | Sets the alignment of body text: **Follow the book**, **Left** or **Justified** |
| **Character spacing** | Adds space between letters, from 0% to 25% of the font size. 0% keeps the book's spacing |
| **Word spacing** | Adds space between words, from 0% to 50% of the font size. 0% keeps the book's spacing |
| **Paragraph spacing** | Sets the space between paragraphs, from 0% to 200% of the font size. 0% keeps the book's spacing |
| **Hyphenation** | Sets whether long words break across lines with a hyphen. The values are **Follow the book**, **On** and **Off** |
| **Font** | Sets the font for book text |
| **Font size** | Sets the size of book text, from 80% to 300% |
| **Preview** | Shows a sample of book text with your changes |

**Brightness**, **Text margins**, **Line spacing** and **Font size** have a slider and a number field.

The display style bar in the reader has the same controls. A change in one place also changes the other.

**Toolbar**, **Reader theme manager** and **Tooltip distance** are not part of the display style.

### Toolbar

These settings are in **Settings → Orbis Reader → Appearance → Toolbar**. Each setting shows or hides one button on the reader's toolbar. Each row shows the icon of its button. All are enabled by default.

| Setting | What it does |
|---|---|
| **Show Navigator** | Shows the **Navigator** button |
| **Show search button** | Shows the **Search in book** button |
| **Show bookmark button** | Shows the **Bookmark this location** button |
| **Show listen button** | Shows the **Listen** button |
| **Show note icons button** | Shows the **Toggle note icons** button |
| **Show display style button** | Shows the **Display style** button |
| **Show annotation marks button** | Shows the **Annotation marks** button, which opens the marks for this book's passage selections and notes |
| **Show focus mode button** | Shows the **Focus mode** button, which turns Focus mode on and off |

If you hide a button, you can still run its command from the command palette.

---

## Reading behavior

These settings are in **Settings → Orbis Reader → Reading behavior**. They change how the reader behaves while you read. For settings about what you add to a book, see [Annotations](#annotations).

| Setting | What it does |
|---|---|
| **Turn pages with the keyboard** | Moves through the book with the Left and Right arrow keys, Space, Page Up and Page Down. Other hotkeys that you set keep working. Enabled by default |
| **Show page arrows** | Shows the ‹ and › at the edges of the page. When they are hidden, selecting either edge still turns the page. Enabled by default |
| **Flash book text for navigation and search results** | Flashes the passage when a search result, a bookmark or a link takes you to it. Enabled by default |
| **Link preview** | Shows a preview of the destination when you select a link in a book. Enabled by default |
| **Confirm before deleting notes** | Prompts you before an annotation note is deleted. Enabled by default |

### Opening a book

These settings set how a book opens. They apply each time a book opens:

- When you select the book in the Files pane
- When you select a link to the book
- When you open the book from the library
- When Obsidian opens the books that you had open

| Setting | What it does |
|---|---|
| **How the book opens** | Sets the reading mode that a book opens in: **Standard mode**, **Focus mode** or **Full-screen audio player**. The default is **Standard mode** |
| **Open with** | Sets the bar that opens under the toolbar: **Listening bar**, **Search bar** or **No bar**. The default is **No bar**. Hidden when the reading mode is **Full-screen audio player** |

The button with the headphones icon in the library and a `listen=1` link always start listening. These settings do not change them.

### Read in Orbis Reader

These settings are on the **Read in Orbis Reader** page, under **Opening a book**. They set how a note opens when you use [Read in Orbis Reader](read-in-orbis-reader.md), and the type of its title note.

| Setting | What it does |
|---|---|
| **Change how the book opens when using Read in Orbis Reader** | Shows **How the book opens** and **Open with**. When it is disabled, the book opens the same way as other books. Disabled by default |
| **How the book opens** | Sets the reading mode: **Standard mode**, **Focus mode** or **Full-screen audio player**. The default is **Standard mode**. Shown only when **Change how the book opens when using Read in Orbis Reader** is enabled |
| **Open with** | Sets the bar that opens under the toolbar: **Listening bar**, **Search bar** or **No bar**. The default is **Listening bar**. Hidden when the reading mode is **Full-screen audio player** |
| **Type** | Sets the `type` property of the book's title note. The default is `obsidian-note`. Shown only when Library dashboards is enabled |

The **Read in Orbis Reader** row on the **Reading behavior** page shows the selected reading mode and bar. It shows them only when **Change how the book opens when using Read in Orbis Reader** is enabled.

### Reading progress indicator

The progress indicator is in the center of the toolbar. Select it to go to the next mode that is enabled. After the last mode, the progress indicator is blank.

| Setting | What it does |
|---|---|
| **Show reading progress indicator** | Shows the progress indicator on the toolbar. When it is disabled, the modes below are hidden. Enabled by default |
| **📖 Book % complete** | Shows how much of the book you have read, based on your current location |
| **📑 Chapter % complete** | Shows how much of the chapter you have read, based on your current location |
| **📖 Book locs.** | Shows your current location and the total number of locations in the book |
| **📑 Chapter locs.** | Shows your current location and the total number of locations in the chapter |
| **📖 Book time remaining** | Shows the estimated time to finish the book, based on your reading speed |
| **📑 Chapter time remaining** | Shows the estimated time to finish the chapter, based on your reading speed |

All six modes are enabled by default. At least one mode must stay enabled.

---

## Listening

These settings are in **Settings → Orbis Reader → Listening**. They change the voices, playback, the full-screen audio player and the pronunciation glossary. See [Listening](listening.md).

| Setting | What it does |
|---|---|
| **Live voice** | Opens a page where you select the voice that reads aloud without a recording. The row shows the selected voice |
| **Hear the live voice** | Plays a sample of the live voice |
| **Recorded voice** | Opens a page with the settings for recordings. Recordings are higher quality and use less battery. The row shows the voice for the next recording |
| **Hear the recording voice** | Plays a sample of the voice for recordings |
| **Downloaded voices** | Opens the **Downloaded voices** dialog, where you delete Orbis voices to free space on this device. The button is **Manage downloads** |

### Playback

| Setting | What it does |
|---|---|
| **Rewind button** | Sets how far back the rewind button goes, from 5 to 60 seconds. It goes back to the start of a sentence. The default is 15 seconds |
| **Forward button** | Sets how far forward the forward button goes, from 5 to 60 seconds. The default is 15 seconds |
| **Read ahead** | Sets how much text a live voice prepares at a time: **Sentence** or **A few sentences**. **A few sentences** starts a little more slowly and can play more smoothly on a slower device. The default is **Sentence** |
| **Highlight while reading** | Sets how much text is highlighted as it is read: **Off**, **Word**, **Sentence** or **Paragraph**. The default is **Sentence** |
| **Always use the live voice** | Uses your live voice even when a book has a recording. Disabled by default |
| **Keep screen awake while listening** | Keeps the screen on while audio plays. This uses more battery. Disabled by default |

### Full-screen audio player

| Setting | What it does |
|---|---|
| **How much the mark button marks** | Sets whether the mark button in the full-screen audio player marks the **Sentence** or the **Paragraph**. The default is **Sentence** |
| **How much the note button captures** | Sets whether the note button in the full-screen audio player captures the **Sentence** or the **Paragraph**. The default is **Sentence** |

### Pronunciation glossary

This section has one row. The row shows how many respellings you have, and its **Manage glossary** button opens the pronunciation glossary.

Add a respelling to set how a voice pronounces a word, for example a name. The voice uses the respelling in every book. You can also add respellings from the Look-up dialog while you read. See [Look-up](look-up.md).

---

## Annotations

These settings are in **Settings → Orbis Reader → Annotations**. They change the marks, reading records, notes styles and Save annotations as PDF. An annotation is a bookmark, a passage selection or an annotation note.

| Setting | What it does |
|---|---|
| **Manage annotation presets** | Opens the **Marks manager**, where you define marks and select the preset that a book uses. See [Annotations and Presets](annotations-and-presets.md) |
| **Reading records** | Opens the [Reading records](#reading-records) page |
| **Notes styles** | Opens the [Notes styles](#notes-styles) page |
| **Save annotations as PDF** | Opens the [Save annotations as PDF](#save-annotations-as-pdf) page |

### Reading records

These settings are in **Settings → Orbis Reader → Annotations → Reading records**. See [Reading Records](reading-records.md).

| Setting | What it does |
|---|---|
| **Write a reading record for each book as you read** | Sets when reading records are written: **Off**, **On for every book** or **Ask for each book**. The first time you enable reading records, a dialog prompts you for their folder. The default is **Off** |
| **Where each book's reading record goes** | Sets where reading records are saved: **In one folder for every book** or **Beside each book** |
| **Folder for reading records** | Sets the folder for the reading records of every book. Shown only when **In one folder for every book** is selected |
| **Create one base covering every book** | Adds one Obsidian base that shows the reading records from every book. Each book also has its own base |
| **Folder for the base covering every book** | Sets the folder for that base. Shown only when **Create one base covering every book** is enabled |
| **Passage selections**, **Notes** and **Bookmarks** | Sets which annotations get a reading record. These are under **What gets added to the vault**. **Passage selections** and **Notes** are enabled by default. At least one must stay enabled |

The settings below **Write a reading record for each book as you read** show after you set up reading records.

### Notes styles

**Generate notes** uses a notes style to write the annotations in a book to Obsidian notes: one note, or a book folder with one note for each chapter. These settings are in **Settings → Orbis Reader → Annotations → Notes styles**. The page lists the notes styles that you can select in [Generate Notes](generate-notes.md).

A notes style sets what a notes file contains, how it is laid out, and which marks it includes. Each notes style has settings such as **Default folder for notes files**, **Save as** and **Note content**. **Set as default** selects the notes style that the Generate notes dialog shows first.

A notes style can write a book folder that contains no annotations. Use it to make an outline of a book that you have not marked.

### Save annotations as PDF

These settings are in **Settings → Orbis Reader → Annotations → Save annotations as PDF**. See [Save Annotations as PDF](save-annotations-as-pdf.md).

| Setting | What it does |
|---|---|
| **Default folder for PDF files** | Sets where PDFs are saved: **Same folder as the book** or **In the folder specified below**. The default is **Same folder as the book**. This setting is separate from the one in **Conversions → Save as PDF** |
| **PDF folder path** | Sets the folder for PDFs. Shown only when **In the folder specified below** is selected |
| **Marked up by** | Sets the name printed under the title of the PDF. **Conversions → Save as PDF** uses the same name. A change in one place also changes the other |

---

## Look-up

These settings are in **Settings → Orbis Reader → Look-up**. They change the offline dictionaries, the sections of the Look-up dialog, and the search destinations. See [Look-up](look-up.md).

| Setting | What it does |
|---|---|
| **Webster’s 1913** | Downloads or removes Webster's 1913, a historical English dictionary. About 21 MB |
| **WordNet 2025** | Downloads or removes Open English WordNet, a modern English dictionary. About 21 MB |
| **Look-up sections** | Lists the sections of the Look-up dialog: **Definition**, **In your vault** and **Search the web**. You can reorder them and hide them. At least one must stay visible |
| **Search destinations** | Lists the websites in the **Search the web** section. You can add, edit, reorder and disable them. At least one must stay active |

The dictionaries are under **Offline dictionaries**. Each has a **Download** button, which changes to **Remove** after the download.

Look-up shows definitions from each dictionary that is downloaded. To stop showing the definitions from a dictionary, select **Remove**.

---

## Library dashboards

These settings are in **Settings → Orbis Reader → Library dashboards**. They change the title notes, covers, dashboards, collections and properties of the library. See [Library Dashboards](library-dashboards.md).

| Setting | What it does |
|---|---|
| **Enable the library** | Shows your titles on dashboards, which you open from the ribbon. When you enable it, a dialog prompts you for the folder for title notes and whether to save covers. Disabled by default |
| **Folder for new title notes** | Sets where new title notes are written |
| **Save cover images** | Saves a cover image file for each book, about 40 KB each. Disabled by default |
| **Covers folder** | Sets where cover images are saved. The default is a `covers` folder in the folder for title notes |
| **Library status** | Shows which books are cataloged and which are not. **Review** opens the catalog review |
| **Show a notice when books are uncataloged** | Shows a notice at the top of the dashboard, with a shortcut to the catalog review. Enabled by default |
| **Dashboards and collections** | Opens a page where you build dashboards, add widgets and define collections |
| **Properties** | Opens a page where you match library properties to the properties in your notes, add custom properties and name their values |

When **Enable the library** is disabled, the other settings on this page are hidden. The ribbon button and the command are also hidden, and an open Library view closes.

---

## Book sources

These settings are in **Settings → Orbis Reader → Book sources**. They change the OPDS feeds and the folder for downloaded books. See [Book Sources](book-sources.md).

| Setting | What it does |
|---|---|
| **Book sources** | Enables book sources. When you enable it, a dialog prompts you for your consent and for the folder for downloads. Disabled by default |
| **Downloads folder** | Sets where downloaded books are saved |
| **OPDS feeds** | Lists your OPDS feeds. To add a feed, select **Add a source**. You can edit, reorder, enable, disable and delete feeds. Project Gutenberg is in the list by default |

When **Book sources** is disabled, the other settings on this page are hidden. The ribbon button and the command are also hidden.

---

## Conversions

These settings are in **Settings → Orbis Reader → Conversions**. The page has one page for each conversion. Each page sets the defaults that its dialog starts with. To find which conversion to use, see [Exporting and Converting with Orbis Reader](exporting-and-converting.md).

For settings about your annotations, see [Annotations](#annotations).

### Save as Markdown

These settings are in **Settings → Orbis Reader → Conversions → Save as Markdown**. See [Save as Markdown](save-as-markdown.md).

| Setting | What it does |
|---|---|
| **Default folder for Markdown files** | Sets where converted books are saved: **Same folder as the book** or **In the folder specified below**. The default is **Same folder as the book** |
| **Markdown folder path** | Sets the folder for converted books. Shown only when **In the folder specified below** is selected |
| **Default format** | Sets **Book folder**, with one note for each chapter, or **Single Obsidian note**, with the whole book in one note. The default is **Book folder** |
| **Include images** | Saves the book's images in the vault. Enabled by default |
| **Link format** | Sets wikilinks or standard Markdown links for images and for the book's own links. The default is wikilinks. You can set it only here, because the Save as Markdown dialog does not show it |

### Save as PDF

These settings are in **Settings → Orbis Reader → Conversions → Save as PDF**. See [Save as PDF](save-as-pdf.md).

| Setting | What it does |
|---|---|
| **Default folder for PDF files** | Sets where PDFs are saved: **Same folder as the book** or **In the folder specified below**. The default is **Same folder as the book**. This setting is separate from the one in **Annotations → Save annotations as PDF** |
| **PDF folder path** | Sets the folder for PDFs. Shown only when **In the folder specified below** is selected |
| **Marked up by** | Sets the name printed on the cover sheet. **Annotations → Save annotations as PDF** uses the same name. A change in one place also changes the other |
| **Include marks and notes** | Draws your marks in the book's text. When it is disabled, the PDF is a plain copy of the book. Enabled by default |
| **Cover sheet** | Adds a first page with the title and a legend that shows what each mark means. Hidden when **Include marks and notes** is disabled. Enabled by default |
| **Expanded character set** | Downloads the fonts that a PDF needs to show more than about 220 characters, such as arrows, Greek, Cyrillic and mathematical symbols. Both Save as PDF and Save annotations as PDF use these fonts |

To remove the expanded character set, use the **Remove** button on this page. You cannot remove it anywhere else.

### Save as EPUB

These settings are in **Settings → Orbis Reader → Conversions → Save as EPUB**. See [Notes to EPUB](notes-to-epub.md).

| Setting | What it does |
|---|---|
| **Default folder for EPUB files** | Sets where EPUB files are saved: **Beside the note or folder** or **In the folder specified below**. The EPUB for a folder is saved beside the folder, not in it. The default is **Beside the note or folder** |
| **EPUB folder path** | Sets the folder for EPUB files. Shown only when **In the folder specified below** is selected |
| **Fetch remote images by default** | Downloads the images that notes link to on the web, and adds them to the EPUB. Disabled by default, because it contacts servers outside your vault |
| **Type for converted books** | Sets the `type` property of a converted book's title note. The default is `book`. Shown only when Library dashboards is enabled |
| **Chapter breaks** | Sets the heading level that starts a new chapter: **None — one chapter**, or **Heading 1** to **Heading 6**. The default is **Heading 2**. If the content has no heading at that level, Orbis Reader uses the nearest level |

---

## Devices

These settings are in **Settings → Orbis Reader → Devices**. They change how you use this vault on more than one device. See [Sync and Devices](sync-and-devices.md).

| Setting | What it does |
|---|---|
| **Use this vault on more than one device** | Enables multi-device use on this device. The first time, it opens the setup dialog. When it is disabled, the other settings on this page are hidden and have no effect. Disabled by default |
| **Device name** | Sets the name that Orbis Reader shows for this device. If it is blank, Orbis Reader shows the device ID |
| **Device ID** | Shows the identifier of this device in the files that Orbis Reader writes. You can select and copy it, but you cannot change it |
| **Share reading location with other devices** | Reads the reading locations from your other devices, and shows them in the **Device locations** dialog when you open a book. Enabled by default |
| **Share Orbis Reader configuration in the vault** | Writes this device's configuration to files in the vault, and reads the files from your other devices. Disabled by default |
| **Vault folder for configuration files** | Sets the folder for configuration files. The default is `!orbis-data/sync`. Shown only when **Share Orbis Reader configuration in the vault** is enabled |

Orbis Reader writes files to your vault. To copy them to your other devices, use a sync tool, such as Obsidian Sync, iCloud or Syncthing.

---

## See also

- [Display Settings](display-settings.md): describes display styles and the display style bar
- [Sync and Devices](sync-and-devices.md#settings-shared-between-devices): describes which settings are shared with your other devices
- [Command Reference](command-reference.md): lists the commands in the command palette
- [Getting Started](getting-started.md): describes how to install Orbis Reader and open a book
