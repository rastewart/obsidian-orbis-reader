# Sync and Devices

← [User Guide](README.md)

---

## Overview

If you use one vault on more than one device, Orbis Reader can share this data between the devices:

- **Reading location**: where you are in each book, so that you can continue on another device. See [Reading location sharing](#reading-location-sharing).
- **Orbis Reader configuration**: your marks, library dashboards, display styles and the other settings that describe your vault. See [Settings shared between devices](#settings-shared-between-devices).

You select each one when you set up a device. A book's annotations need no setup. Each device writes them to its own file in the vault. See [A book's annotations](#a-books-annotations).

Orbis Reader writes this data to files in your vault. To copy the files to your other devices, use a sync tool, such as Obsidian Sync.

---

## Sync tools

Orbis Reader writes its files to your vault. A sync tool copies the vault files between your devices. For example, you can use Obsidian Sync, Self-hosted LiveSync, iCloud or Syncthing. If no sync tool copies your vault, the settings on the **Devices** page have no effect.

If you use Obsidian on one device only, you do not need the settings on the **Devices** page. No other feature of Orbis Reader requires them.

### Files that your sync tool must copy

Orbis Reader keeps your books and its data in ordinary files in the vault. None of them are hidden files. Your sync tool must copy all of these file types:

| Files | Examples |
|---|---|
| Books | `.epub`, `.mobi`, `.azw3`, `.fb2`, `.cbz` |
| Each book's data, in its `!orbis-data` folder | The `.orbis` file, and the `.json` files for annotations and reading locations |
| Configuration files, if you share them | The `.json` files in `!orbis-data/sync` |
| Notes | Title notes, reading records and generated notes (`.md`), and the `.base` files for reading records |
| Other files that you make | Cover images, recordings (`.mp3`) and PDF files |
| Fonts, if you import them | The `.ttf` and `.otf` files in `!orbis-data/fonts` |

If your sync tool does not copy a book or its `!orbis-data` folder, the book is missing on your other devices, or opens there without your annotations and reading location.

The Files pane does not show every one of these files. Obsidian shows only the file types that Obsidian or an enabled plugin can open, so the `.json` files are not in the Files pane. They are still in your vault, and your sync tool still sees them.

### Obsidian Sync

By default, Obsidian Sync does not copy books or the `.json` files that Orbis Reader writes, because Obsidian does not open these file types.

1. Go to **Settings → Sync**.
2. Under **Selective sync**, enable **Sync all other types**.
3. To sync cover images, recordings and PDF files, make sure that **Sync images**, **Sync audio** and **Sync PDFs** are enabled.
4. Do these steps on each device.

If **Sync all other types** is disabled, your notes sync, but your books and their annotations do not.

Under **Vault configuration sync**, **Installed community plugins** syncs the plugin's settings file (`data.json`) with the plugin. If you enable it, see [Syncing the plugin's settings file](#syncing-the-plugins-settings-file).

### Self-hosted LiveSync, iCloud and Syncthing

These sync tools copy every file type, so you do not need to add file types. Orbis Reader's files are not hidden files, so you do not need the LiveSync settings for hidden files either. Those settings are for the `.obsidian` folder, which contains the plugin's settings file (`data.json`).

If you make your sync tool ignore some files or folders, do not ignore the book files or the `!orbis-data` folders.

---

## Devices and device IDs

A device is one vault on one computer, phone or tablet. If one laptop opens two vaults, Orbis Reader treats them as two devices. The settings for one vault do not change the settings for the other vault.

Orbis Reader identifies each device by its device ID. The device ID is made at random, one for each vault, and it is not based on anything about the device. The device ID is in the names of the files that Orbis Reader writes, so devices do not overwrite each other's files.

The **Device name** is a name that you give the device. Orbis Reader shows it where it shows information about another device. If you leave it blank, Orbis Reader shows the device ID.

Both are in **Settings → Orbis Reader → Devices**. You cannot change the **Device ID**, but you can select and copy it, for example to match a file to a device.

---

## Set up a device

Do these steps on each device that uses the vault.

1. Make sure that a sync tool copies your vault between your devices.
2. Go to **Settings → Orbis Reader → Devices**.
3. Enable **Use this vault on more than one device**.
4. In the **Use this vault on more than one device** dialog, enter a name under **What is this device called?**.
5. Under **What should this device share?**, enable or disable **Reading location** and **Orbis Reader configuration**.
6. If you enabled **Orbis Reader configuration**, select a folder under **Where should these files go?**.
7. Select **Enable**.

**Reading location** is enabled by default. **Orbis Reader configuration** is disabled by default, because it writes a folder of files to your vault.

If your sync tool syncs the plugin's settings file (`data.json`), keep **Orbis Reader configuration** disabled. See [Syncing the plugin's settings file](#syncing-the-plugins-settings-file).

If the vault already has configuration files from another device, the dialog shows that folder. Use that folder, so that the files stay together. The folder setting is shared, so after one device selects a folder, the other devices use it.

If you select **Cancel**, **Use this vault on more than one device** stays disabled.

After you select **Enable** in the dialog, **Use this vault on more than one device** enables and disables without the dialog. While it is disabled, the other settings on the **Devices** page are hidden.

For what each one shares, see [Reading location sharing](#reading-location-sharing) and [Orbis Reader configuration sharing](#orbis-reader-configuration-sharing).

For the sync tools that copy your vault, see [Sync tools](#sync-tools).

---

## Set up a device when Orbis Reader prompts you

When you open a book, the **Using Orbis Reader with multiple devices?** dialog can open. It opens when the vault has reading-location files from another device, and this device is not set up. It opens at most once until Obsidian restarts.

1. Open a book.
2. In the **Using Orbis Reader with multiple devices?** dialog, do one of these:
   - To set up this device, select **Set up**. Then do steps 4 to 7 in [Set up a device](#set-up-a-device).
   - To close the dialog until Obsidian restarts, select **Not now** or the Close button.
   - To stop the dialog on this device, select **Don't ask again**.

After you select **Don't ask again**, you can still set up the device in **Settings → Orbis Reader → Devices**.

---

## Orbis Reader configuration sharing

When **Share Orbis Reader configuration in the vault** is enabled, the device writes a copy of each shared item to a folder in your vault. It also reads the copies that your other devices write there. The shared items include your marks, your library dashboards and your display styles. The full list is in [Settings shared between devices](#settings-shared-between-devices).

### Enable Orbis Reader configuration sharing later

If you did not enable **Orbis Reader configuration** in the setup dialog, you can enable it later.

If your sync tool syncs the plugin's settings file (`data.json`), keep **Share Orbis Reader configuration in the vault** disabled. See [Syncing the plugin's settings file](#syncing-the-plugins-settings-file).

1. Go to **Settings → Orbis Reader → Devices**.
2. Enable **Share Orbis Reader configuration in the vault**.
3. Optional: In **Vault folder for configuration files**, select a different folder.

No dialog opens. Orbis Reader uses the folder that your other devices write to. If no device writes configuration files yet, it uses `!orbis-data/sync`.

For what is shared, see [Settings shared between devices](#settings-shared-between-devices).

### How changes from other devices are combined

The newest version of each item replaces the older versions. Orbis Reader does not prompt you, and you cannot undo it.

- Each device writes only its own files, so your sync tool does not get two versions of one file.
- Changes to different items are all kept. For example, if you rename a dashboard on your laptop and add a collection on your phone, both changes are kept.
- If two devices change the same item, the later change replaces the whole item. For example, if two offline devices rename one dashboard, the later name is kept.
- All the settings in [Shared settings](#shared-settings) are one item. If two devices change different shared settings between syncs, the later device's settings replace all of them.
- A deleted item is deleted on every device. It does not come back from a device that still had it.

Orbis Reader reads the files from other devices at these times:

- When Obsidian starts
- When a configuration file arrives in your vault
- When you return to the Obsidian window

It does not check on a timer.

### Configuration files

The configuration files are in `!orbis-data/sync` by default. To change the folder, change **Vault folder for configuration files**.

Each file name identifies the type of item, the item and the device. For example:

```
!orbis-data/sync/orbis-sync.dashboards.dashboard-a1b2c3.macbook-7f3a91.json
```

Orbis Reader finds these files anywhere in your vault. You can move them, and you lose nothing. If a device writes its files to a different folder, your other devices still read them.

There is one file for each item on each device. Each file is a few hundred bytes.

Deleting the folder where the sync files are stored will not prevent sharing. Your settings are stored in the plugin's settings file (`data.json`), and the files in the folder are copies. If you delete the folder, each device writes all its files again. To stop sharing, disable **Share Orbis Reader configuration in the vault**.

### Syncing the plugin's settings file

Your sync tool can also sync the plugin's settings file (`data.json`), for example with Obsidian Sync. This file is one unit. If two devices change different settings between syncs, one of the changes is lost.

Orbis Reader configuration sharing writes one file for each item. A change is lost only when two devices change the same item.

Do not use both. If your sync tool syncs the plugin's settings file (`data.json`), keep **Share Orbis Reader configuration in the vault** disabled. Orbis Reader does not detect when both are in use.

---

## Settings shared between devices

When **Share Orbis Reader configuration in the vault** is enabled on two devices, they share the items and settings in this section. Items and settings that describe your vault are shared. Settings that describe one device, such as its screen, its voices or its controls, stay on that device.

### Shared items

- Display styles that you create
- Annotation presets and their marks
- Notes styles
- Library dashboards and collections
- The properties on the **Properties** page of **Library dashboards**
- The pronunciation glossary

### Shared settings

| Page | Shared settings |
|---|---|
| **Appearance → Reader theme manager** | The reader themes, their order, and which reader themes are enabled |
| **Fonts** | **Vault folder for fonts**, and which fonts are shown in the **Font** list |
| **Reading behavior → Read in Orbis Reader** | **Type**, which sets the `type` property of the book's title note |
| **Listening** | **How much the mark button marks** and **How much the note button captures** |
| **Annotations → Reading records** | **Write a reading record for each book as you read**, **Where each book's reading record goes**, **Folder for reading records**, **Create one base covering every book**, **Folder for the base covering every book**, and the settings under **What gets added to the vault** |
| **Annotations → Save annotations as PDF** | **Default folder for PDF files**, **PDF folder path**, **Marked up by** and **Font** |
| **Look-up** | **Look-up sections** and **Search destinations** |
| **Library dashboards** | **Enable the library**, **Folder for new title notes**, **Save cover images** and **Covers folder** |
| **Book sources** | **Downloads folder**, and the feeds in **OPDS feeds** |
| **Conversions → Save as Markdown** | **Default folder for Markdown files**, **Markdown folder path**, **Default format**, **Include images** and **Link format** |
| **Conversions → Save as PDF** | **Default folder for PDF files**, **PDF folder path**, **Marked up by**, **Font**, **Include marks and notes** and **Cover sheet** |
| **Conversions → Save as EPUB** | **Default folder for EPUB files**, **EPUB folder path**, **Type for converted books**, **Chapter breaks** and **Font** |
| **Devices** | **Vault folder for configuration files** |

Your answers to the setup questions for Library dashboards and Reading records are also shared. On your other devices, these tasks on the **Setup** page show **Ready**, and Orbis Reader does not prompt you for their folders again.

### Settings on each device

| Page | Settings on each device |
|---|---|
| **Setup** | The **Book sources**, **Look-up**, **Listening** and **Devices** tasks |
| **Appearance** | The **This device** display style, the display style in use, **Tooltip distance**, and every setting on the **Toolbar** page |
| **Reading behavior** | **Turn pages with the keyboard**, **Show page arrows**, **Flash book text for navigation and search results**, **Link preview**, **Confirm before deleting notes**, the settings under **Opening a book**, the reading mode and bar for **Read in Orbis Reader**, and every setting under **Reading progress indicator** |
| **Listening** | The **Live voice** and **Recorded voice** settings, **Downloaded voices**, every setting under **Playback**, and the playback speed |
| **Look-up** | The offline dictionaries that are downloaded |
| **Library dashboards** | **Show a notice when books are uncataloged**, the order of the dashboards, which dashboard is **Showing now**, and which dashboards are **Disabled** |
| **Book sources** | **Book sources**, and the username and password for each feed |
| **Conversions** | **Fetch remote images by default** |
| **Devices** | **Use this vault on more than one device**, **Device name**, **Device ID**, **Share reading location with other devices** and **Share Orbis Reader configuration in the vault** |

Notices that you dismissed, **Show what's new after an update** and the developer options also stay on each device.

Orbis Reader stores the settings for each device on the device, not in the vault. If you clear Obsidian's app data, these settings go back to their defaults.

### Display styles

Each device has a **This device** display style. You cannot rename, delete or share it. Display styles that you create are shared.

Each device selects its own display style. A display style from another device does not change the style that this device uses. If the style that this device uses changes on another device, the reader shows the change.

The toolbar buttons and the progress indicator are not part of a display style. They stay on each device.

### Dashboards

The content of a dashboard is shared. Its place in the list, and whether it is **Showing now** or **Disabled**, stay on each device. For example, your laptop can show a dashboard that is disabled on your phone.

A dashboard that you make on one device shows at the end of the list on your other devices. If you move it on one device, it does not move on the others.

### Folders

Folder paths specified in settings are shared, so you only have to select each folder once. After one device selects a folder, your other devices do not prompt you for it.

### Book sources and passwords

The username and password for an OPDS feed are not shared. They are stored in the Obsidian keychain on each device. A feed from another device shows on this device without its username and password.

**Book sources** is not shared, so you enable book sources on each device. For example, you can keep book sources disabled on a phone with a limited data plan.

---

## Reading location sharing

Each device writes a reading-location file for each book that it opens. The file is in the book's `!orbis-data` folder, and its name includes the device ID. The device uses this file to store its own reading location, so it writes the file even when it does not share anything.

When **Share reading location with other devices** is enabled, the device also reads the reading-location files from the other devices.

### Go to your reading location from another device

When you open a book that another device opened more recently, the **Device locations** dialog opens. For each device, it shows the device name, when the book was last opened there, and the location.

1. Open the book.
2. In the **Device locations** dialog, do one of these:
   - To go to the location from another device, select **Go** next to that device.
   - To stay at the location on this device, close the dialog.

**Share reading location with other devices** must be enabled on this device and on the other device.

### When Orbis Reader checks the other devices

Orbis Reader checks the other devices' files when you open a book, and again a few seconds later. The second check finds files that your sync tool copies just after the book opens.

Orbis Reader does not check while a book stays open. If you change your reading location on your phone while the book is open on your laptop, the laptop does not prompt you. To get the new location, close the book and open it again.

### See the reading location on each device

1. Open the book.
2. Run **Show reading locations on all devices** from the command palette.

The **Reading activity** table in the book's reading data shows the same information. In that table, each location is a link. See [The .orbis File](orbis-file.md).

### When reading location sharing is disabled

When **Share reading location with other devices** is disabled:

- The device still writes its reading-location file. The file is marked so that your other devices do not show its reading location.
- The **Device locations** dialog does not open on this device.
- **Show reading locations on all devices** and the **Reading activity** table still list every device.

Disabling **Use this vault on more than one device** has the same effect.

---

## A book's annotations

Your annotations show on every device that your sync tool copies the vault to. You do not need to set anything up.

Each device saves its changes to a book's annotations in its own file, in the book's `!orbis-data` folder: `<book>.marks.<deviceId>.json`. The book's [.orbis file](orbis-file.md) is built from all of these files. Two devices never write the same file, so your sync tool never has two versions of one file to choose between.

Changes that you make on different devices are all kept. For example, if you mark different passages on two offline devices, both devices have both marks after they sync. If two devices change the same annotation, such as one note, the later change is kept.

When the file from another device arrives, an open book shows the changes. You do not need to reload the book, and no notice shows. For example, if you mark a passage on your phone, the mark shows in the same book on your laptop as soon as your sync tool copies the file to the laptop.

The device files also contain the book's preset, its reading stats, the notes files that Generate notes made, and the book's reading records choice. They are shared in the same way.

If you delete a book's .orbis file, the book's annotations are deleted on every device. This includes annotations that a device made offline before the delete. Annotations made after the delete stay.

Deleting or renaming the book itself does not clear its annotations in this way. When you rename a book, its .orbis file moves with it.

---

## Stop sharing

1. Go to **Settings → Orbis Reader → Devices**.
2. Do one of these:
   - To stop sharing your Orbis Reader configuration, disable **Share Orbis Reader configuration in the vault**.
   - To stop sharing your reading location, disable **Share reading location with other devices**.
   - To stop both, disable **Use this vault on more than one device**.

When you disable **Share Orbis Reader configuration in the vault**, Orbis Reader stops writing and reading configuration files immediately. The files in your vault stay. If you do not need them, delete the folder.

When you disable **Use this vault on more than one device**, this device stops reading the files from your other devices. It stops showing their reading locations, and your other devices stop showing its reading location.

Disabling these settings does not delete your configuration. Your marks, dashboards and display styles stay in the plugin's settings file (`data.json`) on each device.

For what happens when reading location sharing is disabled, see [When reading location sharing is disabled](#when-reading-location-sharing-is-disabled).

---

## Options and settings

These settings are in **Settings → Orbis Reader → Devices**.

| Setting | What it does |
|---|---|
| **Use this vault on more than one device** | Enables multi-device use on this device. The first time, it opens the setup dialog. When it is disabled, the other settings on this page are hidden and have no effect. Disabled by default |
| **Device name** | Sets the name that Orbis Reader shows for this device. If it is blank, Orbis Reader shows the device ID |
| **Device ID** | Shows the identifier of this device in the files that Orbis Reader writes. You can select and copy it, but you cannot change it |
| **Share reading location with other devices** | Reads the reading locations from your other devices, and shows them in the **Device locations** dialog when you open a book. Enabled by default |
| **Share Orbis Reader configuration in the vault** | Writes this device's configuration to files in the vault, and reads the files from your other devices. Disabled by default |
| **Vault folder for configuration files** | Sets the folder for configuration files. The default is `!orbis-data/sync`. Shown only when **Share Orbis Reader configuration in the vault** is enabled |

**Vault folder for configuration files** is shared with your other devices. The other settings apply only to the device you set them on.

---

## Troubleshooting

### Changes from another device do not show

1. Make sure that a sync tool copies your vault. Look for the other device's files in your vault. If they are not there, the problem is in the sync tool. With Obsidian Sync, make sure that **Sync all other types** is enabled. See [Files that your sync tool must copy](#files-that-your-sync-tool-must-copy).
2. Make sure that the settings are enabled on both devices. These settings are not shared, so you must enable them on each device. Syncing your `.obsidian` folder does not enable them.
3. Switch to another app, then back to Obsidian. Orbis Reader reads new files when you return to the window.
4. For a reading location, close the book and open it again.

---

## See also

- [The .orbis File](orbis-file.md): describes the reading-location files, the `!orbis-data` folder and the reading data
- [Reading Progress](reading-progress.md): describes reading locations and the progress indicator
- [Annotations and Presets](annotations-and-presets.md): describes presets and marks, which are shared items
- [Settings Reference](settings-reference.md#devices): lists every setting, including the **Devices** page
