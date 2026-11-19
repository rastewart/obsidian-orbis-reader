# Getting Started

← [User Guide](README.md)

---

## Overview

Orbis Reader is an Obsidian plugin for reading books in your vault. It opens EPUB, MOBI, AZW3, CBZ and FB2 files. To see what works with each format, and which books it cannot open, see [Format Support](format-support.md).

Orbis Reader needs Obsidian 1.14.4 or later.

---

## Install Orbis Reader

1. Go to **Settings → Community plugins**.
2. If **Restricted mode** is enabled, disable it.
3. Select **Browse** and search for **Orbis Reader**.
4. Select **Install**, then select **Enable**.

Obsidian offers each new release of Orbis Reader as an update in **Settings → Community plugins**. You can also see Orbis Reader in the [Obsidian community plugin directory](https://community.obsidian.md/plugins/orbis-reader).

---

## Install Orbis Reader with BRAT

To test betas before they are released, install Orbis Reader with BRAT instead of from the community plugins. BRAT (Beta Reviewers Auto-update Tester, by tfthacker) is a community plugin that installs plugins from their repository. BRAT also installs each new release of Orbis Reader when Obsidian starts.

1. Go to **Settings → Community plugins**.
2. If **Restricted mode** is enabled, disable it.
3. Select **Browse** and search for **BRAT**.
4. Select **Install**, then select **Enable**.
5. Go to **Settings → BRAT**.
6. Next to **Beta plugin list**, select the **+** button.
7. In the **Repository** box, enter the address of the Orbis Reader repository: `https://github.com/rastewart/obsidian-orbis-reader`.
8. Select **Select a version**, and select the version. To get each new version when it comes out, select **Latest version**. To stay on one version, select a release, such as `0.1.0-beta.4`. Do not select **dictionaries**: that release has the dictionaries for Look-up, not the plugin.
9. Make sure that **Enable after installing the plugin** is selected.
10. Select **Add plugin**.

You can also start at step 7 from the command palette (`Ctrl/Cmd+P`): run BRAT's **Add a beta plugin for testing** command.

The **Beta plugin list** on BRAT's settings page lists every plugin that BRAT manages. Orbis Reader is listed as `rastewart/obsidian-orbis-reader`. Next to it:

- To check for an update immediately, select the update button (two curved arrows).
- To change the version, select the edit button (pencil), and select the version in the **Change plugin version** dialog.

If you selected one release, BRAT does not update Orbis Reader.

Orbis Reader sometimes publishes a beta, which is a version for testing before it is released. A beta's version number ends in `-beta` and a number, such as `0.2.0-beta.1`. When BRAT installs the latest version of Orbis Reader, it installs betas too, and then the full release when it comes out. To get full releases only, select a full release in step 8, and select the new release on BRAT's settings page when it comes out. The community plugin store never offers a beta.

---

## Install Orbis Reader by hand

1. Go to the [Orbis Reader releases](https://github.com/rastewart/obsidian-orbis-reader/releases) and download the three files of the newest release: `main.js`, `manifest.json` and `styles.css`. The release named **Dictionaries** contains the dictionaries for Look-up, not the plugin.
2. In your vault, create the folder `.obsidian/plugins/orbis-reader/`.
3. Copy the three files into that folder.
4. In Obsidian, go to **Settings → Community plugins**.
5. If **Restricted mode** is enabled, disable it.
6. If **Orbis Reader** is not in the list, select the reload button beside **Installed plugins**.
7. Enable **Orbis Reader**.

---

## Update Orbis Reader by hand

1. Download the three files of the new release: `main.js`, `manifest.json` and `styles.css`.
2. Copy all three files into `.obsidian/plugins/orbis-reader/`, and replace the old files.

Do not copy only some of the files. A new `main.js` with an old `styles.css` can make the plugin look broken.

---

## Set up the features you want

Books open and display with no setup. The other features are optional.

1. Go to **Settings → Orbis Reader → Setup**.
2. Optional: Change the reader theme and the font size in the appearance controls at the top of the page.
3. For each feature that you want, select **Set up**, **Download** or **Choose** in its row.

The first time Orbis Reader runs on a device, the **Welcome to Orbis Reader** dialog opens. To go to the Setup page, select **Open setup**.

For the features on the Setup page, see [The Setup page](#the-setup-page).

---

## Open a book

1. Add the book file to your vault.
2. In the Files pane, select the book.

The book opens in the reader.

A book file can open as something else, such as plain text or another plugin's view. To open it in the reader, run **Open book** from the command palette. The book opens in a new pane beside the current one.

For how to turn pages and see the book's contents, see [Your first book](#your-first-book).

---

## Listen to a book

Orbis Reader can read a book aloud. It highlights the text that it reads, and turns the pages.

1. Open the book.
2. On the toolbar, select the **Listen** button. You can also run **Toggle listening bar** from the command palette.
3. On the listening bar, select **Play**.
4. The first time, select a voice.

An Orbis voice downloads to your device and works offline. It is the recommended voice, and the only voice type on Android. On a desktop, iPad or iPhone, you can also use a system voice from your operating system. To manage voices, go to **Settings → Orbis Reader → Listening**.

To open the full-screen audio player, select the **Show player** button (headphones icon) on the listening bar. The full-screen audio player has a progress bar, track skip, and buttons to mark, note or bookmark the passage that you hear. See [Listening](listening.md).

---

## The Setup page

The Setup page has one task for each optional feature:

- **Book sources**
- **Look-up**: offline dictionaries
- **Library dashboards**
- **Reading records**
- **Listening**: a voice
- **Expanded PDF character set**: the fonts for Save as PDF
- **Devices**: this device's name and what it shares

Each task describes what it does. If a task downloads files, it shows their size. The **Setup** row in settings shows how many tasks are done, for example *3 of 7*.

The appearance controls at the top of the page change the reader theme and the font size, and show a sample of the text. See [Settings Reference](settings-reference.md) for the Setup page.

---

## Your first book

- To turn a page, select the left or right edge of the page. On a touch screen, you can also swipe, except in a CBZ book.
- To see the book's contents, select the **Navigator** button (☰) on the toolbar. The Navigator also has tabs for search, your annotations and the book's stats.

For the toolbar, page turns, the Navigator, going to a location, going back and Focus mode, see [Reading a Book](reading-a-book.md).

---

## Reading progress

Orbis Reader saves your reading location while you read. When you open the book again, it opens at that location.

The progress indicator in the middle of the toolbar shows your progress. Select it to change between book and chapter percentages, locations and time remaining. See [Reading Progress](reading-progress.md).

---

## Getting back to a book

To find a book again and continue reading, see [Getting back to a book](reading-a-book.md#getting-back-to-a-book).

---

## Deep links

A deep link opens a book at a location from any Obsidian note. To make one, go to the place in the book and run **Copy link to current location** from the command palette. Then paste the link into a note. See [Deep Links](deep-links.md).

---

## Troubleshooting

### Orbis Reader does not enable

Another plugin in the vault can already open `.epub` files, for example an older EPUB reader plugin. Obsidian gives a file extension to one plugin only, so the second plugin does not load.

1. Disable the other plugin in **Settings → Community plugins**.
2. Enable **Orbis Reader** again.

---

## See also

- [Reading a Book](reading-a-book.md): describes the reader, the toolbar and the Navigator
- [Display Settings](display-settings.md): describes fonts, reader themes and display styles
- [Listening](listening.md): describes voices, the listening bar and the full-screen audio player
- [Reading Progress](reading-progress.md): describes the progress indicator and reading stats
- [Library Dashboards](library-dashboards.md): describes the library and its dashboards
- [Settings Reference](settings-reference.md): lists every setting
