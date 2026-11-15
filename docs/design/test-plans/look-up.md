# Test plan — Look-up

← [Design Docs](../README.md)

Looking up a selected word or phrase: the Look-up dialog, its two offline dictionaries, what the vault has, the web destinations, and the **Look-up** settings that shape them. What a user sees is in the guide: [Look-up](../../guide/look-up.md).

**Not here:** teaching a word's pronunciation in depth and the pronunciation glossary ([Listening](../../guide/listening.md)), and the dictionaries and destinations reaching another device ([Sync and devices](../../guide/sync-and-devices.md)). Each belongs to its own page.

---
## Where each step runs

Every step carries one tag.

| Tag       | Run it on                                                    |
| --------- | ------------------------------------------------------------ |
| `once`    | Any one device. The result does not depend on the device     |
| `each`    | Every device: Mac, Android, iPhone and iPad                  |
| `desktop` | The Mac — a pointer and a keyboard                           |
| `mobile`  | Android, iPhone and iPad — touch                             |
| `phone`   | Android and iPhone — a phone-sized screen                    |
| `ipad`    | The iPad                                                     |
| `android` | Android                                                      |

---
## Setup

- [ ] `once` In **Settings → Orbis Reader → Look-up → Offline dictionaries**, remove both dictionaries if either is on this device, so the steps below can download them.

- [ ] `once` In the vault, make a note named **Lantern**, a note named **before** in lower case, and two notes named **Weir** in two different folders.

- [ ] `once` In **Settings → Orbis Reader → Look-up**, **Look-up sections** lists **Definition**, **In your vault** and **Search the web** in that order, all three showing. Under **Search destinations**, the active destinations are Wikipedia, Google, Wiktionary and Merriam-Webster, in that order, and nothing else is active.

- [ ] `once` Open `annotation-workhorse.epub`. The words below are all in it.

---
## Opening the Look-up dialog

- [ ] `each` Select the word **lantern** and choose **Look up** on the marks bar. The Look-up dialog opens titled **Look up: lantern**, with **Speak** and **Pronunciation** above three sections: **Definition**, **In your vault** and **Search the web**.

- [ ] `each` Select a passage you have marked, without selecting text: the marks bar for that mark opens, and it has no **Look up**. Now drag to select a few words that overlap the marked passage: the bar offers only **Look up** and **Copy link**, and **Look up** opens the Look-up dialog for those words.

- [ ] `desktop` **Escape** closes the Look-up dialog, and so does selecting outside it.

---
## Definition

- [ ] `each` With no dictionary on this device, the **Definition** section offers a button to download one instead of a definition. Select it: the dictionary downloads, and the definition appears in its place.

- [ ] `once` In **Look-up → Offline dictionaries**, download **Webster's 1913** alone, removing **WordNet 2025** if the button above took it. Each row says what its dictionary is for and its size, and links to where it came from — *Webster's Revised Unabridged Dictionary (1913) · public domain*, *Open English WordNet · CC BY 4.0* — and the downloaded one reads **Downloaded · N MB** and offers **Remove**.

- [ ] `each` Look up **lantern**: Webster's definition. Look up **windswept**: it says **Not in Webster's 1913.**, naming the dictionary rather than saying the word does not exist.

- [ ] `once` Download **WordNet 2025** as well. Look up **lantern** again: two tabs above the definition, **Webster's 1913** and **WordNet 2025**, and each shows its own entry.

- [ ] `each` Look up **windswept**: WordNet's definition, with no tabs, since Webster's has no entry. Look up **beside**: Webster's alone. Look up **Oakhallow**: **Not in either dictionary.**

- [ ] `each` Look up **mended**: the definition of **mend**. The word's base form is looked up when the word itself is not an entry.

- [ ] `each` Select the phrase **kitchen garden** and look it up: WordNet's entry for the phrase. Select **harbor wall**, which neither dictionary has: the dialog shows no **Definition** section at all, only **In your vault** and **Search the web**.

- [ ] `each` A long definition scrolls inside its own box without moving the rest of the dialog, and its text can be selected.

---
## In your vault

- [ ] `each` Look up **lantern**. **In your vault** shows **Open note: Lantern**, **Search file names for "lantern"** and **Search everything for "lantern"**. Select **Open note: Lantern**: the dialog closes and the note opens.

- [ ] `once` Select **Before** with its capital, at the start of a sentence such as *Before breakfast, …*, and look it up. The **before** note is still found, and the button names it as it is spelled: **Open note: before**.

- [ ] `each` Look up **weir**. There is no **Open note** button, since two notes share the name. **Search file names for "weir"** opens Obsidian's search on `file:"weir"`, with two results, both named **Weir**. Select each: they open the two different notes.

- [ ] `each` Look up **ferry** and select **Search everything for "ferry"**. The dialog closes, and Obsidian's search opens with *ferry* searched across names and contents.

- [ ] `once` Select **the lantern** and look it up: no **Open note** button, since the whole selection has to match a note's whole name.

---
## Search the web

- [ ] `each` **Search the web** shows Wikipedia, Google, Wiktionary and Merriam-Webster, in that order. Select **Wiktionary**: the browser opens Wiktionary's page for the word, and the dialog stays open. Select **Wikipedia**: the same.

- [ ] `once` In **Look-up → Search destinations**, the four active ones come first, then the eight built-ins that are off: Bing, DuckDuckGo, Google Books, Etymonline, Wikiquote, Google Translate, Thesaurus.com and Britannica. Turn **Etymonline** on and move it to the top. Look up a word: **Etymonline** is the first web button.

- [ ] `once` A built-in destination has no edit or delete control, only its switch. Turn every destination off but one: the last one's switch is disabled, and its row says **At least one destination must stay active.** after its address. Turn another on: the lock and the line go.

- [ ] `once` Select **Add a destination**. Save it with no name: **Enter a name.** Name it **Test** with the address `https://example.com/search`: **URL must start with http:// or https:// and contain {{query}}.** Change it to `https://example.com/search?q={{query}}`: **Destination added**, and it is in the list.

- [ ] `once` Look up a word and select **Test**: the browser opens example.com with the word in the address. Edit **Test** with its pencil and rename it **Example**: the dialog's button follows. Delete it: it asks **Delete destination?** with **"Example" will be removed from the Look-up dialog.**, and after **Delete** it is gone.

---
## Speak and pronunciation

- [ ] `each` Look up **lantern** and select **Speak**. The word is read aloud in this device's live voice, and the button reads **Stop** while it speaks. Select **Stop** on a long selection: it stops at once.

- [ ] `once` Start listening to the book, pause it, then look up a word and select **Speak**. The word is spoken, and listening stays paused afterwards.

- [ ] `each` **Pronunciation** shows for a single word and not for **kitchen garden**. For **Oakhallow**, select it: an editor titled **Say "Oakhallow" as** opens. Spell it **Oak HAL oh** and save. Back in the Look-up dialog, **Pronunciation** is tinted, and its tooltip says **Spoken as "oak hal oh". Select to change.** — in lower case, since respellings are saved that way.

- [ ] `once` Select **Speak** for **Oakhallow**: it is said as you spelled it. Remove the respelling from the editor: it asks **Remove the replacement for "Oakhallow"? It will be spoken normally again.**

---
## Look-up sections

- [ ] `once` In **Look-up → Look-up sections**, move **Search the web** to the top and hide **In your vault**. Look up a word: **Search the web** comes first, and there is no vault section.

- [ ] `once` Hide every section but one: the last one's switch is disabled, and its row says **At least one section must stay visible.** Put the sections back as they were.

---
## Clean up

- [ ] `once` Delete the **Lantern** note, the **before** note and the two **Weir** notes. Leave both dictionaries downloaded, or remove them if the next run should start without them. Destinations and sections are as shipped.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
