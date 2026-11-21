# Data and Storage

← [User Guide](README.md)

---

## Overview

Orbis Reader stores your reading data in ordinary files in your vault. You can open, back up and sync these files with the tools that you already use.

This page shows where Orbis Reader stores each type of data. It also shows which files Orbis Reader reads, and when it uses the clipboard, the network, WebAssembly and files outside your vault. The last section connects each item in the Community plugins directory's review of Orbis Reader to the section of this page that explains it.

---

## Data in your vault

Orbis Reader stores your reading data in the vault, in files that you can see. Your sync tool and your backups include these files.

| Data | Where Orbis Reader stores it |
|---|---|
| Books | Where you put them. Orbis Reader never changes a book file |
| A book's reading data | In the `!orbis-data` folder beside the book. This folder contains the `.orbis` file, a file of annotations for each device, a reading location file for each device, and recordings in an `audio` folder |
| Configuration shared between devices | In `!orbis-data/sync`, unless you change **Vault folder for configuration files** |
| Notes and files that you make with Orbis Reader, such as title notes, covers, reading records, generated notes, Markdown and PDF files, and EPUB books made from notes | In the folders that you select in settings |
| Books from book sources | In the **Downloads folder** that you select for book sources |

The `.orbis`, annotation, location and configuration files are plain JSON. For the contents of the `.orbis` file, see [The .orbis File](orbis-file.md). For the files that your sync tool must copy, see [Sync and Devices](sync-and-devices.md#files-that-your-sync-tool-must-copy).

---

## Data in the plugin folder

The plugin folder is `.obsidian/plugins/orbis-reader` in your vault. If you changed Obsidian's configuration folder, the plugin folder is in that folder.

| File or folder | What it contains |
|---|---|
| `data.json` | The Orbis Reader settings that are the same on all your devices |
| `data.backup.json` | A copy of `data.json`. If `data.json` cannot be read, Orbis Reader restores the settings from this copy |
| `dictionary` | The offline dictionaries that you downloaded for **Look-up** |
| `font-cache` | The fonts of the **Expanded character set** for PDF files, if you downloaded them |
| `piper-cache` | The speech engine and the Orbis voices that you downloaded |

Orbis Reader downloads the dictionaries, the fonts and the speech engine only when you select a download. Before it uses one of these files, Orbis Reader compares the file with a checksum that is fixed in the plugin. If the file is different, Orbis Reader does not use it.

---

## Data on each device only

Some settings apply to one device, such as the display style that the device uses, the selected toolbar buttons, the voice and the playback speed. Orbis Reader stores these settings in Obsidian's local storage for the vault, on that device.

Local storage is not part of the vault. Your sync tool does not copy it, so a setting on your phone does not change the same setting on your computer. For the full list, see [Settings on each device](sync-and-devices.md#settings-on-each-device).

If you clear Obsidian's app data, or install Obsidian again, the settings on each device go back to their defaults. Your books, annotations and shared settings stay in the vault.

The username and password for an OPDS feed are stored in the Obsidian keychain on each device. They are not stored in the vault.

---

## Files that Orbis Reader reads

Orbis Reader reads and writes vault files through Obsidian. It gets the list of the files in your vault for these features:

| Feature | Why Orbis Reader gets the list of files |
|---|---|
| Library | Finds your books, title notes and covers, and the notes that link to a book |
| Reading records | Finds the records that it keeps up to date |
| Sync and devices | Finds the reading locations and configuration files of your other devices |
| Look-up | Finds the vault notes that match the selected text |
| Book sources | Finds a free file name for a book that you download |
| Read in Orbis Reader | Finds the book that was made from a note |

Orbis Reader does not send the list of files, or the files, to any other place.

---

## The clipboard

Orbis Reader writes to the clipboard only when you select a copy command, such as **Copy text**, **Copy link** or **Copy image**. It does not read the clipboard.

On Android, Orbis Reader also keeps the last image that you copied from a book in memory, so that you can paste it into a note.

---

## WebAssembly

Orbis voices use two WebAssembly modules. One is the speech engine (ONNX Runtime). The other converts text to speech sounds (piper-phonemize). These modules are not part of the plugin's code.

The first time that you download an Orbis voice, Orbis Reader downloads the two modules from `cdnjs.cloudflare.com` and `cdn.jsdelivr.net`. It compares each module with a checksum that is fixed in the plugin, and then saves it in the `piper-cache` folder. If you do not use Orbis voices, Orbis Reader does not download them.

The library that opens EPUB and CBZ files can also use a WebAssembly module. Orbis Reader does not use this module.

---

## The network

Orbis Reader connects to the internet only for the features that you use, and nothing is downloaded until you select it. It does not send your books, notes or reading data to any place, unless you set up a speech server for recordings. For each connection, see [Network use](https://github.com/rastewart/obsidian-orbis-reader#network-use) in the README.

---

## Files outside your vault

On a computer, **Save as PDF**, **Save annotations as PDF**, **Save as Markdown**, **Generate notes** and **Notes to EPUB** have an **Export…** button. It opens your system's save dialog. Orbis Reader writes only the file that you name in the dialog, and only after you select **Save**.

On a phone or tablet, the same dialogs have a **Share…** button instead. Selecting that button sends the file to your device's share sheet, and nothing is written outside the vault.

Orbis Reader does not read or write any other file outside your vault.

---

## The Community plugins directory review

The Community plugins directory reviews each release of Orbis Reader. This table connects each item in the review to the section of this page that explains it.

| Item in the review | Where it is explained |
|---|---|
| **Vault Read** and **Vault Write** | [Data in your vault](#data-in-your-vault) |
| **Direct Filesystem Access** | [Files outside your vault](#files-outside-your-vault) |
| **Vault Enumeration** | [Files that Orbis Reader reads](#files-that-orbis-reader-reads) |
| **Clipboard Access** | [The clipboard](#the-clipboard) |
| **Local Storage** | [Data on each device only](#data-on-each-device-only) |
| **Plugin references unrecognized WASM files** | [WebAssembly](#webassembly) |
| **Number of network request calls** | [The network](#the-network) |
| **Code uses runtime base64 encode or decode calls** | See below |

Orbis Reader decodes base64 to read the images inside FB2 books, the images that a book contains in its text, and the cover that a `.orbis` file contains. It encodes base64 to sign in to an OPDS feed that uses a username and password, and to make a short silent sound that keeps the listening controls active on a phone.

---

## See also

- [Sync and Devices](sync-and-devices.md)
- [The .orbis File](orbis-file.md)
- [Settings Reference](settings-reference.md)
- [Troubleshooting](troubleshooting.md)
