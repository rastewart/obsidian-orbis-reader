# Look-up

← [User Guide](README.md)

---

## Overview

Look-up finds information about text that you select while you read, without leaving the book. The Look-up dialog shows a definition from offline dictionaries, notes in your vault, and web searches for the selected text.

---

## Look up a word or phrase

1. In the book, select the word or phrase.
2. On the marks bar, select **Look up**.

The Look-up dialog opens, titled **Look up: *your selection***. See [Marks and Notes](marks-and-notes.md) for the marks bar.

Look-up is not available when you select an existing passage selection. The marks bar opens without the **Look up** button. To look up the text of a passage selection, select some or all of its words instead. See [Marks and Notes](marks-and-notes.md#what-the-bar-shows).

For the parts of the dialog, see [The Look-up dialog](#the-look-up-dialog).

---

## Hear the selection

1. In the Look-up dialog, select **Speak**.
2. Optional: To stop, select **Stop**.

**Speak** reads the selection aloud in the live voice of this device. While it speaks, the button changes to **Stop**.

If you are listening to the book, the audio pauses before **Speak** starts. It stays paused. To continue, select **Play**.

---

## The Look-up dialog

The Look-up dialog has a row of buttons at the top, then three sections.

| Part | What it does |
|---|---|
| **Speak** | Reads the selection aloud in the live voice of this device |
| **Pronunciation** | Opens the editor where you set how a voice pronounces a word when it reads a book. For single words only. See [Pronunciation](#pronunciation) |
| **Definition** | Shows the entries from the offline dictionaries |
| **In your vault** | Opens a matching note, or searches the file names or the whole vault. See [In your vault](#in-your-vault) |
| **Search the web** | Shows one button for each search destination that is enabled |

When you select a web destination, the web page opens and the Look-up dialog stays open. You can then select another destination. When you open a note or start a vault search, the Look-up dialog closes.

### Definition

The **Definition** section shows entries from the offline dictionaries that are on this device. If no dictionary is on this device, the section shows a **Download** button instead. See [Download the offline dictionaries](#download-the-offline-dictionaries).

| Dictionary | What it contains |
|---|---|
| Webster's 1913 | Webster's Revised Unabridged Dictionary, in the public domain. Contains historical English, with etymologies and archaic senses. Suits older books, such as nineteenth-century texts from Project Gutenberg. Does not contain modern words such as *smartphone* or *internet* |
| WordNet 2025 | The Open English WordNet. Contains modern English, with brief definitions, a part of speech and example sentences for each sense. Contains no etymologies. Contains most modern words and phrases. Licensed CC BY 4.0 |

The **Definition** section shows each dictionary that has an entry for the selection. When both dictionaries have an entry, tabs above the definition switch between them.

When no dictionary has an entry, the section names the dictionaries that were searched. For example: *Not in Webster's 1913.* or *Not in either dictionary.* If you have only Webster's, modern words are not found.

#### Phrases

Look-up also finds phrases. WordNet has more than 52,000 phrases, such as *point of view*, *red herring*, *sea change* and *de facto*.

- If no dictionary has the phrase, the Look-up dialog shows no **Definition** section.
- A plural is found only when it is on the last word of the phrase. *Red herrings* finds *red herring*, but *points of view* does not find *point of view*.

### In your vault

| Button | What it does |
|---|---|
| **Open note: *sample*** | Opens the note. Shows only when exactly one note has a name that matches the whole selection |
| **Search file names for "*sample*"** | Starts an Obsidian search for file names that contain the selection |
| **Search everything for "*sample*"** | Starts an Obsidian search for file names and note text that contain the selection |

The two search buttons always show. Use **Search everything** to find every place the text is mentioned. Use **Search file names** to find a note or a book with that name.

#### The Open note button

- The whole selection must match a whole note name. A long selection finds only a note with exactly those words as its name.
- The match is not case-sensitive. If you select *Sample* in a book, a note named `sample` is found.
- The button shows the name of the note, not your selection.
- Two notes in different folders can have the same name. When more than one note matches, the button does not show. Use **Search file names** to see every match in Obsidian's search, and open the one you want.

#### The name search

**Search file names** finds more than the **Open note** button, and less than **Search everything**:

- It finds every type of file, not only notes. PDFs, EPUBs and the files that Orbis Reader stores beside your books are included if their names contain *sample*.
- It finds names that contain the selection. *sample* finds *Sample Book Notes* and `Sample Book.epub`, and also a note named *sample*.

### Search the web

The **Search the web** section shows one button for each search destination that is enabled.

Four destinations are enabled by default: Wikipedia, Google, Wiktionary and Merriam-Webster. Eight more are built in and disabled by default: Bing, DuckDuckGo, Google Books, Etymonline, Wikiquote, Google Translate, Thesaurus.com and Britannica.

### Pronunciation

The **Pronunciation** button opens an editor where you type a word the way it should sound. The voice then uses your respelling for that word in every book. See [Fix how a word is pronounced](listening.md#fix-how-a-word-is-pronounced).

The button shows for single words only. It is tinted when the word already has a respelling. To change the respelling, select the button again.

---

## Download the offline dictionaries

Do one of these:

- In the Look-up dialog, under **Definition**, select **Download**. This downloads both dictionaries, about 42 MB. When the download finishes, the dialog shows the definition of your selection.
- Go to **Settings → Orbis Reader → Look-up**. Under **Offline dictionaries**, select **Download** beside a dictionary.
- Go to **Settings → Orbis Reader → Setup**. Beside **Look-up**, select **Download**. This downloads both dictionaries.

The **Download** button in the Look-up dialog shows only when no dictionary is on this device.

The dictionaries are not included with the plugin. In settings, the rows are named **Webster's 1913** and **WordNet 2025**. Each is about 21 MB, and each row has a link to the source of its dictionary.

Download both dictionaries for the most results. A word can be in one dictionary and not in the other.

To download a dictionary, Orbis Reader sends a request to a web server. The request asks only for the dictionary file. It does not include text from your books or your vault.

The Look-up dialog uses each dictionary that is on this device. To stop using a dictionary, select **Remove** beside it.

For what each dictionary contains, see [Definition](#definition).

---

## Add a search destination

1. Go to **Settings → Orbis Reader → Look-up**.
2. Under **Search destinations**, select **Add a destination**.
3. In **Name**, enter a name for the button.
4. In **Search URL**, enter the address of the search. Put `{{query}}` where the selected text goes.
5. Select **Save**.

The **Search URL** must start with `http://` or `https://` and contain `{{query}}`.

For the built-in destinations, see [Search the web](#search-the-web).

---

## Change the search destinations

1. Go to **Settings → Orbis Reader → Look-up**.
2. Under **Search destinations**, do one of these:
   - To show or hide a destination, select its switch.
   - To change the order, drag a destination, or select **Move up** or **Move down**.
   - To change a destination that you added, select **Edit**.
   - To delete a destination that you added, select **Delete**, then select **Delete** again to confirm.

At least one destination must stay enabled. You cannot edit or delete a built-in destination. You can only disable it.

For the built-in destinations, see [Search the web](#search-the-web).

---

## Change the sections

1. Go to **Settings → Orbis Reader → Look-up**.
2. Under **Look-up sections**, do one of these:
   - To show or hide a section, select its switch.
   - To change the order, drag a section, or select **Move up** or **Move down**.

At least one section must stay visible.

For the three sections, see [The Look-up dialog](#the-look-up-dialog).

---

## Options and settings

These settings are in **Settings → Orbis Reader → Look-up**.

| Setting | What it does |
|---|---|
| **Offline dictionaries** | Downloads or removes each of the two dictionaries |
| **Look-up sections** | Sets the order of the three sections, and hides the sections that you do not use. At least one section must stay visible |
| **Search destinations** | Sets which web destinations show and in what order. Adds your own destinations |

The pronunciation glossary is in **Settings → Orbis Reader → Listening → Pronunciation glossary**. See [Manage the pronunciation glossary](listening.md#manage-the-pronunciation-glossary).

The dictionaries are downloaded on each device. The look-up sections, the search destinations and the pronunciation glossary are shared with your other devices. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## See also

- [Marks and Notes](marks-and-notes.md): describes how to select text, and the other buttons on the marks bar
- [Listening](listening.md): describes voices, the audio player and the pronunciation glossary
- [Sync and Devices](sync-and-devices.md#settings-shared-between-devices): describes which settings are shared between devices
- [Settings Reference](settings-reference.md): lists every setting, including the Look-up page
