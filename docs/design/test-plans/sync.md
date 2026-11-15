# Test plan — Sync and devices

← [Design Docs](../README.md)

Using one vault on several devices: the **Use this vault on more than one device** switch and the setup it asks, reading locations, Orbis Reader configuration shared in the vault, a book's marks, notes and bookmarks arriving on another device, notes sets made on two devices at once, and turning it off. What a user sees is in the guide: [Sync and devices](../../guide/sync-and-devices.md).

**Not here:** the reading-record notes a mark writes ([Reading records](reading-records.md)), and what the .orbis file's reading data shows beyond its **Reading activity** table ([The .orbis File](../../guide/orbis-file.md)). Each belongs to its own page.

**Orbis Reader moves no files.** A sync tool does — these steps assume the synced vault's own tool (Self-hosted LiveSync). Where a step says something arrives, give the tool time to deliver the file first; switching to another app and back makes Orbis Reader look straight away.

**Two devices at once.** Most steps here need two devices side by side. They say which, by name: the Mac and Android, unless a step says otherwise. "Offline" means the device's Wi-Fi and mobile data are off, so nothing syncs until they are back on.

**Two vaults.** The first run is tested in the repository's `test-vault` on the Mac, where a copied file stands in for a second device, so the synced vault's own setup is never undone. Everything else runs in your synced vault.

---
## Where each step runs

Every step carries one tag.

| Tag       | Run it on                                                    |
| --------- | ------------------------------------------------------------ |
| `once`    | Any one device — or the two the step names                   |
| `each`    | Every device: Mac, Android, iPhone and iPad                  |
| `desktop` | The Mac — a pointer and a keyboard                           |
| `mobile`  | Android, iPhone and iPad — touch                             |
| `phone`   | Android and iPhone — a phone-sized screen                    |
| `ipad`    | The iPad                                                     |
| `android` | Android                                                      |

---
## Setup

- [ ] `each` In your synced vault, write down what **Settings → Orbis Reader → Devices** says on this device — the switches, the device name and **Vault folder for configuration files** — so Clean up can put them back. On the Mac and Android, **Use this vault on more than one device**, **Share reading location with other devices** and **Share Orbis Reader configuration in the vault** are on for these steps.

- [ ] `once` On the Mac, turn on developer options with **Orbis Reader: Toggle developer options** if **Sync status (dev)** is not in the palette, and turn on the **`sync`** pill in the debug log: each scan logs `scan (<reason>) — adopted N, published N, failed N`, and each thing that arrives `adopted <type> from <device name>`.

- [ ] `once` Close `fixtures/annotation-workhorse.epub` everywhere, and delete `fixtures/!orbis-data/annotation-workhorse.epub.orbis` on the Mac, so the book starts with no marks, notes or bookmarks on any device.

---
## The first run

In `test-vault`, on the Mac. A copy of one of the Mac's own location files, under another device's ID, is what makes the vault look used elsewhere. Turn on only what a step says to: the first setup comes from opening a book, not from Settings.

- [ ] `desktop` Open `test-vault`. Run **Reset multi-device sync first-run (dev)**: **Reset multi-device sync?** — select **Reset**: **Sync reset to first-run: N file(s) trashed. Turn it on in settings to test.** **Settings → Orbis Reader → Devices** shows one row, **Use this vault on more than one device**, off, with *A separate tool is required to sync vault data between devices.* Leave it off and close Settings.

- [ ] `desktop` Open `fixtures/First-Open.epub` and close it. In `fixtures/!orbis-data/`, copy `First-Open.epub.location.<id>.json` — `<id>` is this device's — to `First-Open.epub.location.othertest1.json`, which stands in for a second device.

- [ ] `desktop` Open any book: **Using Orbis Reader with multiple devices?**, under **Orbis Reader** — *This vault has Orbis Reader data from other devices. Orbis Reader can use it to share your last reading location and your settings with this device.* — with **Don't ask again** on the left and **Not now** and **Set up** on the right. Select **Not now**. Open another book: it does not ask again.

- [ ] `desktop` Reload Obsidian and open a book: it asks again. Select **Set up**: **Use this vault on more than one device** opens, asking **What is this device called?** with a name already suggested for this kind of device, such as **Mac**, and **What should this device share?**, with **Reading location** on and **Orbis Reader configuration** off. Turn **Orbis Reader configuration** on: **Where should these files go?** appears under it, on `!orbis-data/sync`. Turn it off again: the question goes. Select **Cancel**: **Use this vault on more than one device** is still off.

- [ ] `desktop` Turn **Use this vault on more than one device** on in Settings: the same dialog opens. Name the device **Test Mac**, turn **Orbis Reader configuration** on, and select **Enable**. The Devices page now shows **Device name** (**Test Mac**), **Device ID** — twelve letters and digits, not editable, all selected when you select it — **Share reading location with other devices** (on), **Share Orbis Reader configuration in the vault** (on) and **Vault folder for configuration files** (`!orbis-data/sync (default)`). `!orbis-data/sync/` holds files named `orbis-sync.<type>.<item>.<id>.json`.

- [ ] `desktop` **Settings → Orbis Reader → Setup** shows **Devices** as **Ready**. Turn **Use this vault on more than one device** off: every row under it goes. Turn it on: no dialog this time, and the rows come back as they were.

- [ ] `desktop` Run **Reset multi-device sync first-run (dev)** again, reload, and open a book. When it asks, close it with **×**. Reload and open a book: it asks again — **×** means Not now. This time select **Don't ask again**. Reload and open a book: it does not ask, and does not ask again after another reload.

- [ ] `desktop` Make a folder named `Sync elsewhere` at the top of `test-vault`, and copy `fixtures/sync/othertest1-device.json` into it as `orbis-sync.devices.othertest1.othertest1.json`: another device that publishes somewhere other than the default.

- [ ] `desktop` Turn **Use this vault on more than one device** on in Settings. In the dialog, leave **Orbis Reader configuration** off and select **Enable**. Turn **Share Orbis Reader configuration in the vault** on: nothing asks, and **Vault folder for configuration files** shows `Sync elsewhere` — the folder the vault already uses — not `!orbis-data/sync (default)`. This device's files appear in `Sync elsewhere/`, and none in `!orbis-data/sync/`.

---
## The Devices page

In your synced vault.

- [ ] `each` **Settings → Orbis Reader → Devices** shows this device's name and its own **Device ID**, different on every device. Under **Device name** it says *Provide a name you recognize, e.g. "my iPhone" or "work laptop". Orbis Reader uses this name when showing you information that is specific to this device. Leave it blank and Orbis Reader shows the randomly generated device ID instead.* Select the ID field: the whole ID is selected, ready to copy, and typing changes nothing.

- [ ] `once` On Android, change **Device name** to **Android test**. On the Mac, once it has synced, **Show reading locations on all devices** in a book Android has opened lists it as **Android test**. Put the name back.

---
## Reading locations

`fixtures/annotation-workhorse.epub`, on the Mac and Android.

- [ ] `once` On the Mac, open the book, read to the third chapter, and close it. On Android, once the Mac's location file has synced, open the book: **Device locations** — *Select a device to jump to its last reading location.* — lists the Mac first, with when it was last opened and its **loc. N**, and Android's own row marked **· This device**. Select **Go** on the Mac's row: the book goes to the third chapter.

- [ ] `once` Close and reopen the book on Android without reading on the Mac in between: no **Device locations** — nothing newer happened elsewhere. Close the book on Android after reading a few pages; open it on the Mac: **Device locations** offers Android's place. Close it with **×**: the Mac stays where it was.

- [ ] `once` With the book open on both devices, read on in it on Android. The Mac does not offer Android's place while the book stays open there — it is checked only when a book opens. Close and reopen it on the Mac: now it does.

- [ ] `desktop` Quit Obsidian on the Mac, read on in the book on Android, then relaunch the Mac — it reopens the book — and go straight into **Settings**, which opens in a window of its own. Leave it in front for a few seconds: no **Device locations** appears in it, and the **`sync`** pill logs `sync prompt deferred — a dialog is up`. Select the book's window, leaving Settings open: within a few seconds **Device locations** appears there, in the book's window, not in Settings.

- [ ] `once` On Android, turn off **Share reading location with other devices**. Read on in the book there and close it. On the Mac, open the book: no **Device locations** offers Android's place. **Show reading locations on all devices** still lists Android, and so does the **Reading activity** table on the book's `.orbis` file — **Device**, **Last opened**, **Last location**.

- [ ] `once` With the switch still off on Android, read on in the book on the Mac and close it. On Android, open the book: no **Device locations** appears — a device that keeps its place to itself is not offered the others' either. Turn the switch back on.

- [ ] `once` On Android, turn off **Use this vault on more than one device** and repeat the two steps above: both directions behave the same, because a device not taking part keeps its place to itself. Turn it back on.

- [ ] `each` **Show reading locations on all devices** opens **Device locations** with a row per device that has opened the book; in a book no device has opened, it says **No reading locations found for this book**.

---
## Orbis Reader configuration

On the Mac and Android, both sharing configuration. Nothing in this section asks before a change arrives, and no notice says it did — the **`sync`** pill on the Mac is where to see it.

- [ ] `once` On the Mac, in **Settings → Orbis Reader → Library dashboards**, add a dashboard named **Sync test**. On Android, once it has synced: **Sync test** is at the end of the dashboard list, switched on. Move it to the top on Android: on the Mac it stays at the end — the order is each device's own, and moving it publishes nothing, so the Mac's log shows no `adopted dashboards` for it.

- [ ] `once` On the Mac, in **Settings → Orbis Reader → Appearance**, make a display style named **Sync test** with a larger font. On Android, **Sync test** is in the **Display style** list, but the style in use there has not changed. Choose **Sync test** on Android, then change its font size on the Mac: the book open on Android takes the new size without being reopened. Choose your usual style again on both devices.

- [ ] `once` On the Mac, in **Appearance → Reader theme manager**, switch on **Midnight** and make a theme of your own named **Sync theme**. Move **Midnight** to the top of the list. On Android, the Reader theme manager's list starts with **Midnight**, switched on, and ends with **Sync theme**, switched on, and the **Reader theme** list follows that order. Choose **Sync theme** on Android, then change its background on the Mac: the book open on Android repaints without being reopened. Choose your usual theme again on Android.

- [ ] `once` Each device's own **This device** display style, the one it started with, never appears on the other. In **Settings → Orbis Reader → Appearance → Toolbar** on the Mac, turn off **Show search button**: Android's toolbar still has it. Put it back.

- [ ] `once` On Android, add **esker** to the pronunciation glossary (**Settings → Orbis Reader → Listening → Pronunciation glossary → Manage glossary**). On the Mac, the glossary lists **esker**.

- [ ] `once` On the Mac, add a preset named **Sync test preset** in the **Marks manager**. On Android it is in the **Marks manager**'s presets. Delete it on Android: **Delete preset?** adds *It will also be removed from your other devices the next time they sync.* After **Delete**, it is gone on the Mac too.

- [ ] `once` On the Mac, add a web destination to **Look-up** in **Settings**. On Android, the Look-up dialog offers it. Remove it on the Mac: it goes from Android too.

- [ ] `once` Put Android offline. Rename **Sync test** — the dashboard — to **Sync A** on Android, then to **Sync B** on the Mac. Also add a collection named **Only on Android** on Android. Put Android back online: both devices show the dashboard as **Sync B** — the later change wins, whole — and both show **Only on Android**, a different item, untouched by the clash.

- [ ] `once` Put Android offline. Delete **Sync B** on the Mac. Put Android back online: **Sync B** goes from Android too, and does not come back to the Mac from Android's copy.

- [ ] `desktop` `!orbis-data/sync/` holds one file per item per device: `orbis-sync.<type>.<item>.<device id>.json`, with both devices' IDs among them. Delete the `sync` folder: within a scan or two — switch away from Obsidian and back — it is there again, written by both devices, and nothing in either device's settings has changed.

- [ ] `desktop` Run **Sync status (dev)**: a notice says it was written to the debug log, and the **`sync`** pill shows what a scan would adopt and publish, without doing either.

---
## A book's marks, notes and bookmarks

`fixtures/annotation-workhorse.epub`, open on the Mac and Android at the same time.

- [ ] `once` On Android, mark a sentence with **Key point**. On the Mac, once it has synced, the same sentence shows the mark in the book, and the **Annotations** tab lists it — with nothing reopened and no notice.

- [ ] `once` Put Android offline. Mark a sentence on Android, and a different sentence on the Mac. Put Android back online: both sentences are marked on both devices — each device's marks are its own file, so neither replaces the other.

- [ ] `once` Add a note to a passage on the Mac and let it sync. Put Android offline; change the note's text to **from Android** there, then to **from the Mac** on the Mac. Put Android back online: both devices show **from the Mac** — the later edit wins whole.

- [ ] `once` Put Android offline and mark another sentence there. On the Mac, delete `fixtures/!orbis-data/annotation-workhorse.epub.orbis`: the book open on the Mac clears — no marks, notes or bookmarks. Mark one sentence on the Mac. Put Android back online: the book on Android is cleared too, including the mark it made while offline, and has only the one sentence the Mac marked after the clear.

- [ ] `once` Open the same page of the book on the Mac and the iPad, then close Obsidian completely on the iPad. On the Mac, mark a sentence on that page. Open Obsidian on the iPad: the book reopens, and the Mac's mark appears on the page shortly after, with nothing reopened.

---
## Starting with a book open

Your synced vault, with its books and their Orbis data.

- [ ] `each` Open a book in Orbis Reader. In the debug log, turn on **Write to note** and the **`index`**, **`sync`** and **`annot`** pills. Close Obsidian completely, then open it again: the book shows its page about as quickly as Obsidian opens with no book open. In that launch's note, the book's `sync read own` line comes within a second of `toc loaded`; no `scan (a file arrived)` comes before it; and `scan (load)` and `catch-up at launch — N books with Orbis data, …` come after it.

---
## Notes made on two devices at once

`fixtures/annotation-workhorse.epub`, with a few marks in it.

- [ ] `once` Put Android offline. On Android, **Generate notes…** into a single note in one folder. On the Mac, **Generate notes…** into a single note in a different folder. Put Android back online and let both notes sync.

- [ ] `each` **Open notes**, from the reader's **⋯** menu or the palette: **Open notes** — *Choose a notes file to open.* — lists both notes, each with its folder under it. Select one: it opens beside the book.

- [ ] `once` On the Mac, **Generate notes…** again into the first note's folder and file. **Open notes** on both devices still lists two — the regenerated one and the other folder's.

---
## Turning it off

- [ ] `once` On Android, turn off **Share Orbis Reader configuration in the vault**: no question, no notice, and **Vault folder for configuration files** goes. Add a dashboard on the Mac: it does not arrive on Android. Android's files stay in `!orbis-data/sync/`. Turn it back on: the dashboard arrives at once.

- [ ] `once` On Android, turn off **Use this vault on more than one device**: every row under it goes. On the Mac, open a book Android has read further in: no **Device locations** offers Android's place. Turn it back on: no setup dialog — and the switches under it are as they were.

### Clean up

- [ ] `once` Delete what this page made: the **Only on Android** collection, the **Sync test** display style, **Sync theme** in the Reader theme manager (and put **Midnight** back after **Charcoal**, switched off), **esker** in the glossary, and the notes generated on both devices. Delete `fixtures/!orbis-data/annotation-workhorse.epub.orbis` if the next run should start clean.

- [ ] `each` Put **Settings → Orbis Reader → Devices** back as you wrote it down. Turn off developer options on the Mac if they were off.

- [ ] `desktop` In `test-vault`, delete `fixtures/!orbis-data/First-Open.epub.location.othertest1.json`, run **Reset multi-device sync first-run (dev)** so the next run starts never set up, and delete the emptied `Sync elsewhere` folder.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
