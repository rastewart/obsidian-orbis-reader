# Listening

← [User Guide](README.md)

---

## Overview

You can listen to a book read aloud with text-to-speech (TTS). While you listen, the sentence being read is highlighted, and the page turns to follow it.

You can listen with an Orbis voice, which downloads to your device and works offline, or with a system voice that your operating system provides. You can also make a recording of a book, or a mix that gives each track its own voice.

---

## Start listening

1. Open a book.
2. On the toolbar, select **Listen**.
3. If the **Listen needs a voice** dialog opens, select a voice. See [Choose a voice when this device has none](#choose-a-voice-when-this-device-has-none).
4. In the listening bar, select **Play**.

You can also run **Toggle listening bar** from the command palette. The command opens the listening bar when the **Listen** button is hidden with **Settings → Orbis Reader → Appearance → Toolbar → Show listen button**.

The listening bar does not start playback when it opens. Two exceptions are **Download and listen** and **Use a system voice** in the **Listen needs a voice** dialog. Both start playback immediately.

To close the listening bar, select **Listen** again. Closing the bar stops playback.

---

## The listening bar

The listening bar is between the toolbar and the page. You can see the book text while you listen.

| Control | What it does |
|---|---|
| **Show player** (headphones) | Opens the full-screen audio player |
| Voice chip | Shows the current voice. Opens **Voice and source**, where you change the voice, select a recording or mix, or set the playback speed. See [The voice chip](#the-voice-chip) |
| **Back 15 seconds** and **Forward 15 seconds** | Move back or forward by the time set in **Rewind button** and **Forward button**. The default is 15 seconds. With a live voice, the skip goes to the start of a sentence, so the time is approximate. With a recording, the skip is exact |
| **Play** and **Pause** | Start and pause playback |

The listening bar has no track buttons and no progress bar. These controls are in the full-screen audio player.

In Focus mode, the listening bar has a Close button. On a computer, press Escape to close the listening bar when nothing is playing.

---

## The full-screen audio player

The full-screen audio player hides the book text and shows the book's cover, title and author, the current track and the voice chip, with all the listening controls.

### Open the full-screen audio player

1. Start listening.
2. In the listening bar, select **Show player**.

You can also run **Toggle full-screen audio player** from the command palette.

To go back to the book text, select **Show text** at the top left of the player. If you run **Toggle full-screen audio player** while the player shows, listening closes and playback stops.

### The player's controls

Under the cover are the progress bar, a row of playback controls and a row of actions.

| Control | What it does |
|---|---|
| **Show text** (down chevron, top left) | Goes back to the book text |
| Voice chip | Shows the current voice. Opens **Voice and source**, where you change the voice, select a recording or mix, or set the playback speed. See [The voice chip](#the-voice-chip) |
| Progress bar | Moves through the track when you drag it. Three times show under it. On the left is the time into the track. In the middle is the time left in the book. On the right is the time left in the track |
| **Previous track** and **Next track** | Go to the previous or next track. **Previous track** goes straight to the previous track, not to the start of the current one |
| **Back 15 seconds** and **Forward 15 seconds** | Move back or forward by the time set in **Rewind button** and **Forward button**. The default is 15 seconds. With a live voice, the skip goes to the start of a sentence, so the time is approximate. With a recording, the skip is exact |
| **Play** and **Pause** | Start and pause playback |
| **Marks for listening and notes** | Opens the **Marks for listening and notes** dialog, where you select the marks that **Mark the passage** and **Add note…** apply. See [Select the marks for listening](#select-the-marks-for-listening) |
| **Mark the passage** | Marks the sentence or the paragraph being read with a passage selection. **How much the mark button marks** sets which |
| **Add note…** | Opens the note editor for a note on the sentence or the paragraph being read. **How much the note button captures** sets which |
| **Bookmark** | Adds an audio bookmark at the sentence being read, or removes it. See [Mark, note or bookmark what you hear](#mark-note-or-bookmark-what-you-hear) |

The settings named in the table are in **Settings → Orbis Reader → Listening**. See [Options and settings](#options-and-settings).

On a computer, hover over a button to see its name.

---

## Mark, note or bookmark what you hear

1. Open the full-screen audio player.
2. Select one of these buttons on the actions row:
   - **Bookmark**: adds an audio bookmark at the sentence being read. Select it again on the same sentence to remove the bookmark.
   - **Mark the passage**: marks the current sentence with a passage selection.
   - **Add note…**: opens the note editor for a note on the current sentence.

By default, **Mark the passage** marks the current sentence, and **Add note…** captures the current sentence. To use the whole paragraph, change **How much the mark button marks** or **How much the note button captures**. These settings are in **Settings → Orbis Reader → Listening → Full-screen audio player**.

If audio is playing when you select **Add note…**, it pauses while the note editor is open. Playback continues when you close the note editor.

See [Marks and Notes](marks-and-notes.md).

---

## Go to an audio bookmark

1. On the toolbar, select **Navigator**.
2. Select the **Annotations** tab.
3. Select the audio bookmark.

Audio bookmarks show on the **Annotations** tab with your other bookmarks. A headphones icon identifies an audio bookmark. When **Flash book text for navigation and search results** is enabled, the passage flashes when you go to it. This setting is enabled by default. If you are listening, the audio moves to the bookmark.

---

## Select the marks for listening

1. In the full-screen audio player, select **Marks for listening and notes**.
2. Under **Passage selections**, select the mark that **Mark the passage** applies.
3. Under **Notes**, select the mark for new notes. To give new notes no mark, select **Unmarked**.
4. Select **Done**.

You can also run **Select marks for listening and notes** from the command palette. The dialog saves each selection when you make it. The selections apply to this book only.

To add or change marks, select **Manage marks** in the dialog. It opens the **Marks manager**.

---

## Lock the controls with Pocket mode

Pocket mode locks the controls of the full-screen audio player. Use it to keep the audio playing with your phone in a pocket. A touch on the screen does not stop or skip the audio while the controls are locked.

On a phone or tablet, select **Lock the controls** (the open lock) at the top right of the full-screen audio player. In Focus mode, it is below the **Exit focus mode** button.

You can also run **Lock listening controls** from the command palette while the listening bar or the full-screen audio player is open. From the listening bar, Pocket mode opens the full-screen audio player.

Pocket mode does not start or stop the audio.

While the controls are locked, the player shows the cover, the title and the progress. The screen stays on, so the audio keeps playing, and it dims to near black to save battery.

To unlock the controls, slide the lock at the bottom right up its track, most of the way to the top. You can also run **Lock listening controls** again. When the controls unlock, Orbis Reader returns to what you saw before you locked them: the full-screen audio player, or the book with the listening bar.

---

## Voices

| Voice | What it is |
|---|---|
| Orbis voice | A natural-sounding voice that downloads to your device, about 60 MB each. It works offline and sounds the same on every device. The voices are American and British English. This is the recommended voice |
| Multi-voice model | A download of about 75 MB that contains many voices. There are two models: **Libritts** and **VCTK** |
| System voice | A voice that your operating system provides on a computer, iPad or iPhone. It needs no download. There are fewer system voices, especially on iPad and iPhone, and they usually sound less natural. Android has no system voices |

Orbis Reader does not download a voice until you select a button that downloads it.

If a voice pronounces a chapter heading or a word incorrectly, try a different voice. Orbis voices sometimes pronounce short or unusual text incorrectly.

---

## Choose a voice when this device has none

The **Listen needs a voice** dialog opens when you start listening on a device that has no voice ready. It does not open for a track that has a recording, because a recording plays without a voice.

1. In the **Listen needs a voice** dialog, select one of these:
   - **Download and listen**: downloads the voice shown and starts playback. The voice shown is the recommended voice, or the voice that you selected before.
   - **Use a system voice**: starts playback in a system voice, with no download. This button is not shown on Android.
   - **Browse voices**: opens the **Live voice** picker over the book.
2. If you selected **Browse voices**, select a voice.
3. If you selected **Browse voices**, select **Done**.

If a voice is ready, the listening bar opens. A voice is ready when it is a system voice or an Orbis voice that is on this device. If you selected an Orbis voice that is not downloaded, the **Listen needs a voice** dialog opens again and shows that voice.

---

## Change the live voice

The live voice reads aloud as you listen, without a recording. You can change it while you listen, or in settings.

1. Do one of these:
   - Select the voice chip on the listening bar or in the full-screen audio player. In the **Voice and source** dialog, select **Change voice**. The **Live voice** dialog opens.
   - Go to **Settings → Orbis Reader → Listening → Live voice**.
2. Select **Orbis voices** or **System voices**, then select a voice. Android has no **System voices** button.
3. If the voice is not on this device, select **Download · 60 MB**. The voice downloads and plays a sample.
4. Optional: To hear the voice again, select **Preview**.
5. If the **Live voice** dialog is open, select **Done**.

Selecting a voice in the list does not download it. The **Download** button shows until the voice is on this device. After that, the button is **Preview**.

The command **Choose listening voice** opens the **Voice and source** dialog.

The live voice is set for each device and each vault. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

For the kinds of voices, see [Voices](#voices).

---

## The voice chip

The voice chip is on the listening bar and on the full-screen audio player. It shows the current voice and the playback speed, for example *Heart · Night reads 1.5×*, with an icon before the name. Select it to open the **Voice and source** dialog.

| Part of the chip | What it shows |
|---|---|
| Icon | Shows a microphone when you hear a recording. Shows broadcast arcs when a live voice speaks |
| First name | Shows the voice that reads this track. In a mix, the voice can change from track to track |
| Second name | Shows the recording or mix selected for this book. It is not shown when nothing is selected. It is also not shown when it is the same as the voice. A recording that you did not rename has its voice's name, so the chip shows *Heart*, not *Heart · Heart* |
| Parentheses around the recording or mix | Shows that you hear your live voice, not the selection |
| Speed | Shows the playback speed, such as *1×* or *1.5×*. On the listening bar, the speed is not shown when the names need the room |

The voice chip shows parentheses in these cases:

- The track is not recorded.
- The mix uses **Default live voice** for the track.
- The mix's voice for the track is not on this device.
- **Always use the live voice** is enabled.

A track that a mix gives a specific live voice shows the live icon without parentheses.

For example, broadcast arcs and *Amy · (Night reads)* show that the recording *Night reads* is selected, but you hear your live voice. The track is not recorded, or **Always use the live voice** is enabled.

The **Voice and source** dialog has three parts:

- **Voice** shows the full name of the voice that reads this track, and the reason. For example: *Your live voice — this track has no recording.* When the voice is your live voice, **Change voice** opens the voice picker. When no voice is downloaded, the button is **Choose a voice**.
- **Speed** sets the playback speed, from 0.5× to 3×. Drag the slider, or type a speed in the box beside it, such as 1.5. The audio keeps playing while you change it. The voice chip shows the speed.
- **Source** shows the recording or mix to play, or **None — use the live voice**. When the selection covers only part of the book, a line shows how much, for example *Recorded: 12 of 30 tracks*. For a mix, only the tracks that play from a recording count. **Manage recordings and mixes** opens the **Recordings and mixes** dialog.

---

## Select a voice in a multi-voice model

1. Go to **Settings → Orbis Reader → Listening → Live voice**.
2. Select **Libritts** or **VCTK**.
3. If the model is not on this device, select its **Download** button.
4. In **Voice #**, select **‹** or **›** to go to the previous or next voice. Each selection plays a sample.

To go to a voice without a sample, type its number in **Voice #**. The voice changes immediately. The **‹** and **›** buttons are unavailable until the model is downloaded.

---

## Delete a downloaded voice

1. Go to **Settings → Orbis Reader → Listening → Downloaded voices**.
2. Select **Manage downloads**.
3. In the **Downloaded voices** dialog, select the trashcan button beside the voice.
4. To confirm, select **Delete**.

The **Downloaded voices** dialog lists the Orbis voices on this device, with the size of each voice and the total size.

You cannot delete your live voice. It is marked **Selected live voice**, and its trashcan button is unavailable. To delete it, select a different live voice first. On a device that has system voices, select a system voice as your live voice to delete every Orbis voice.

Orbis Reader prompts you before it downloads a deleted voice again. This applies to the voice for new recordings and to a voice that a mix uses for a track. Until the mix's voice is downloaded again, that track plays in your live voice.

---

## Chapters and tracks

The audio player plays tracks. Usually a track is a chapter. The label over the controls shows the chapter's name, and **Previous track** and **Next track** move between chapters. A chapter's sub-entries in the table of contents do not get their own tracks.

A track and a chapter are different in these cases:

- **A chapter that is estimated to take more than an hour.** The chapter is divided into tracks of 20 to 30 minutes, labeled *Chapter I 1 of 3*, *2 of 3* and so on. The estimate uses the word count at normal speed. A slow voice or a slow speed can make a track play for more than an hour.
- **A chapter whose text is in two of the book's files.** Each part gets a track, labeled *1 of 2* and *2 of 2*.
- **A book with no table of contents.** Each of the book's files becomes a track, labeled with the book's title: *Title 1 of 46*, *2 of 46* and so on. A file longer than an hour is divided in the same way as a long chapter.

Recordings use the same tracks as the player.

---

## Make a recording

A recording is a set of audio files of the book's tracks, made in one voice and stored in the vault. A recording can have better quality than a live voice, and it uses less battery during playback. A full book can take hours to record, and the MP3 files use space in your vault.

1. Open the book.
2. In the **⋯** menu, select **Manage recordings and mixes**.
3. In the **Recordings and mixes** dialog, select **Add recording**.
4. Optional: Select a different voice. To hear the voice, select **Preview**.
5. Uncheck the tracks that you do not want to record.
6. Select **Generate (N)**.
7. In the **Generate recording?** dialog, select **Generate**.

You can also run **Manage recordings and mixes** from the command palette.

**Add recording** starts with your default recording voice, from **Settings → Orbis Reader → Listening → Recorded voice**. All the book's tracks are selected, each with an estimated length and size. A voice that already has a recording of this book is not listed.

If the voice is not on this device, Orbis Reader prompts you before it downloads the voice.

The **Generate recording?** dialog shows the number of tracks, the voice and an estimated time. When there is no estimate, it shows a warning that the recording can take hours.

Recordings are saved in `!orbis-data/audio/<book file>.audio/` beside your book, for example `sample.epub.audio`. Each recording has its own folder.

---

## While a recording runs

- The recording continues when you close the **Recordings and mixes** dialog. It stops when you close the book.
- A chip on the book shows the progress, for example *Recording… 3/12*. Select the chip to open the dialog again.
- When the recording finishes, the dialog opens with the result.
- Select **Pause** and **Resume** to pause and continue the recording.
- When you select **Stop**, the **Stop recording?** dialog prompts you to confirm.
- On a phone or tablet, the recording can stop when you switch to another app. It continues when you come back to Obsidian.
- If the connection drops many times while Obsidian is in the background, the recording pauses and shows a message. Select **Resume** to continue.

Each track is recorded completely or not at all. A track that fails leaves no partial audio. When a track fails, the report shows the cause. For example, the server did not accept the voice, the server could not be reached, or a device voice must be downloaded again.

---

## Finish a partial recording

1. In the **Recordings and mixes** dialog, select the recording.
2. Select **Generate (N)**.

The tracks that are not recorded are selected when the recording opens.

---

## Rename a recording

1. In the **Recordings and mixes** dialog, select the recording.
2. Select the pencil button beside its name.
3. Enter a name.

A recording has the name of its voice until you rename it. To give a recording its voice's name again, clear the name.

A renamed recording still shows its voice. In the **Recordings and mixes** dialog, the voice shows beside the tracks. In the recording's own dialog, the voice shows under the name.

---

## Delete a recording or a track

To delete a recording:

1. In the **Recordings and mixes** dialog, select the trashcan button beside the recording.
2. In the **Delete files?** dialog, select **Delete**.

To delete one track:

1. In the **Recordings and mixes** dialog, select the recording.
2. Select the trashcan button on the track.
3. In the **Delete this track?** dialog, select **Delete**.

Deleting a recording deletes its audio files. A mix that used the recording plays those tracks in the live voice. A deleted track plays in the live voice until you record it again.

---

## Select what plays

1. Select the voice chip.
2. In the **Voice and source** dialog, under **Source**, select a recording, a mix or **None — use the live voice**.

You can also select the **Use for listening** button (a check mark) beside a recording or mix in the **Recordings and mixes** dialog.

A new recording or mix does not change what plays. The exception is the first recording of a book that has no recordings or mixes. That recording becomes the source.

If you delete the recording or mix that is playing, the source changes to **None — use the live voice**.

---

## How recordings and live voices play together

A recording plays on the tracks that it covers. Your live voice reads the tracks that it does not cover. The voice chip shows which one you hear.

When **Always use the live voice** is enabled, the recording stays selected, but you hear your live voice. The voice chip shows the recording in parentheses. **Source** in the **Voice and source** dialog is unavailable until you disable the setting.

---

## Make a mix

To hear different voices in one book, make a mix. In a mix, you select the voice for each track: a recording, or a live voice. For example, select one voice for the story and another for the letters in it. Or play the tracks that you recorded from the recording, and the other tracks in a live voice.

1. In the **Recordings and mixes** dialog, select **Add mix**.
2. Enter a name for the mix.
3. Select **Create**.
4. In **Source**, select a recording or a live voice.
5. Select the tracks for that source.
6. Select **Use for selected (N)**.
7. Repeat steps 4 to 6 for each group of tracks.

**Source** lists your recordings, each with its name and voice. It also lists **Default live voice**, which is the live voice of the device that plays the mix. To add a specific live voice to the list, select **Add live voice**.

You can use a recording only for the tracks that it recorded. Tracks that you do not assign use **Default live voice**.

Each track row shows **Recorded** or **Live**. The play button on a live row reads the track's first sentence in that voice.

A mix contains no audio. Deleting a mix does not delete the recordings that it uses. You select a mix under **Source**, the same way as a recording.

---

## Mixes on other devices

A mix's voice must be on the device that plays it. Mixes sync between your devices, and downloaded voices do not. For example, a mix made on your computer with the voice Amy can reach a phone that does not have Amy.

On that device, the track plays in the device's live voice. The first time this happens, this notice shows: *The voice this mix uses for this track, Amy, isn't on this device. Using your live voice.* The **Voice and source** dialog shows *Your live voice — this track's voice isn't on this device.*

The voice does not download unless you download it. To hear the mix's voice, download it from the **Live voice** picker, or play the track's row in the mix. The same applies to a system voice on Android, which has no system voices.

---

## Fix how a word is pronounced

A voice may pronounce certain words incorrectly, often names or acronyms. To fix this, give the word a phonetic respelling: the word written the way it sounds. The voice then uses that respelling every time the word appears, in every book.

1. In the book, select the word.
2. On the marks bar, select **Look up**.
3. In the Look-up dialog, select **Pronunciation**.
4. In **Say "*word*" as**, type the word the way it sounds. For example, type `wah-keen` for *Joaquin*.
5. Optional: Select a preview button to hear the respelling.
6. Select **Save**.

Use hyphens to separate syllables. Capitals are ignored, and respellings are stored in lowercase. Show stress with spelling and hyphens, not with capitals.

The preview speaks the word inside a short sentence. You can preview in your live voice, and in your recording voice when it uses a different speech engine.

In the Look-up dialog, the **Pronunciation** button is tinted when a word has a respelling. Its tooltip shows the respelling.

For what a respelling can and cannot fix, see [Pronunciation glossary rules](#pronunciation-glossary-rules).

### Have an acronym read letter by letter

Most acronyms, such as *FBI* and *HTML*, are read letter by letter already. If one is read as a word, or its letters run together, respell it with each letter written the way it sounds, as a separate word. For example, respell *MIT* as `em eye tee`, and *AI* as `eh eye`. Don't join the letters with hyphens: hyphens run them together. Capitals and periods don't help either, because respellings are stored in lowercase.

Write each letter like this:

| Letter | Write | Letter | Write |
|---|---|---|---|
| A | `eh` | N | `en` |
| B | `bee` | O | `oh` |
| C | `see` | P | `pee` |
| D | `dee` | Q | `cue` |
| E | `ee` | R | `ar` |
| F | `ef` | S | `ess` |
| G | `gee` | T | `tee` |
| H | `aitch` | U | `yoo` |
| I | `eye` | V | `vee` |
| J | `jay` | W | `double yoo` |
| K | `kay` | X | `ex` |
| L | `ell` | Y | `why` |
| M | `em` | Z | `zee`, or `zed` for British English |

The respelling makes sure the voice is given the right letters. Each voice still says them in its own way, so preview the respelling in the voices that you use. One respelling applies to every voice.

---

## Manage the pronunciation glossary

The pronunciation glossary lists every respelling that you made.

1. Go to **Settings → Orbis Reader → Listening → Pronunciation glossary**.
2. Select **Manage glossary**.
3. In the **Pronunciation glossary** dialog, do one of these:
   - To add a word, type it in **Find or add a word**, then select **Add**.
   - To change a respelling, select **Edit** on its row.
   - To stop using a respelling without deleting it, uncheck **Active** on its row.
   - To delete a respelling, select **Delete** on its row.

You can also run **Show pronunciation glossary** from the command palette. The row in Settings shows how many respellings you have.

The pronunciation glossary is shared with your other devices when **Share Orbis Reader configuration in the vault** is enabled. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## Pronunciation glossary rules

- A respelling is for a single word only. The **Pronunciation** button does not show when you look up a phrase. The pronunciation glossary accepts a single word with no spaces.
- A respelling applies just before the voice speaks. A change applies immediately to live voices and to new recordings.
- Recorded chapters keep the old pronunciation until you record them again.
- A respelling cannot fix a word that has two pronunciations with the same spelling, such as *read*.

---

## Listening and navigation

- **Where you stopped.** Orbis Reader saves the sentence that you were listening to. The next time you listen, playback starts at that sentence.
- **Going to another place.** If you go to a bookmark, a search result or a chapter while you listen, the audio moves to that place.
- **Turning pages.** If you turn pages by hand, the audio does not move. It continues to follow the sentence being read.
- **Other bars.** Opening the search bar, the Go to bar or the display style bar pauses the audio. The notice *Listening paused* shows, and the listening bar is hidden. The listening bar stays hidden when you close the other bar. Select **Listen** to show it again. **Play** continues from the same sentence, or from the place you went to while the bar was hidden.
- **Offline.** When a voice or the book's recording is on the device, listening needs no network connection.
- **Locked screen.** On iPhone and iPad, Orbis Reader cannot show lock-screen controls or play audio when the screen is off. If the screen turns off or you switch to another app, the audio pauses; select **Play** to continue from the same place. On Android, there are no lock-screen controls. To keep audio playing, enable **Keep screen awake while listening**, or lock the controls with Pocket mode. Both keep the screen on, which keeps the app in the foreground.

---

## What leaves your device

**Orbis voices and system voices send no book text.** Orbis Reader downloads an Orbis voice from Hugging Face when you select to download it. The download is about 60 MB, or about 75 MB for a multi-voice model. The first time a voice speaks, the speech engine downloads from two public CDNs. Both are stored on your device. After that, speech is made on the device, and no text from the book leaves it. System voices download nothing. This is the default.

**A speech server receives your book's text.** A Kokoro speech server (OpenAI-compatible) can make recordings in place of the device. For example, the server can be a Kokoro container on your own computer. When this engine is enabled, Orbis Reader sends the text that it records to the server address, one sentence for each request. The server sends back audio. Previewing a server voice, or a respelling in a server voice, also sends the sample sentence.

- **Server (Kokoro / OpenAI-compatible)** is disabled until you set it up. It shows as **Inactive** in **Settings → Orbis Reader → Listening → Recorded voice**. You cannot enable it until you enter a **Server URL** and select a voice. There is no default address.
- The text goes to the address that you enter. A server on your own network, such as `http://192.168.1.10:8880`, keeps the text on your network. A server that someone else runs receives the passages that you record.

The on-device engine records with no network connection. It is slower than a server, and it is the default recording method.

Orbis Reader has no analytics and no telemetry. It does not report what you read.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Listening**.

The rows from **Rewind button** to **Keep screen awake while listening** are in the **Playback** group. The two rows that start with **How much** are in the **Full-screen audio player** group. **Manage glossary** is in the **Pronunciation glossary** group.

| Setting | What it does |
|---|---|
| **Live voice** | Opens the page where you select the voice that reads aloud without a recording |
| **Recorded voice** | Opens the page where you select the voice and the method for new recordings |
| **Downloaded voices** | Opens the **Downloaded voices** dialog, where you delete Orbis voices |
| **Rewind button** | Sets how far back the back button moves: 5 to 60 seconds. The default is 15 seconds. |
| **Forward button** | Sets how far forward the forward button moves: 5 to 60 seconds. The default is 15 seconds. |
| **Read ahead** | Sets how much text a live voice prepares at a time: **Sentence** or **A few sentences**. The default is **Sentence**, which starts soonest and keeps the highlight exactly on the sentence being read. If playback pauses often, select **A few sentences** |
| **Highlight while reading** | Sets how much text is highlighted as it is read: **Off**, **Word**, **Sentence** or **Paragraph**. The default is **Sentence**. When it is **Off**, the page still turns to follow the audio. **Word** is exact with system voices, and approximate with Orbis voices and recordings |
| **Always use the live voice** | Plays your live voice, also for a book that has a recording |
| **Keep screen awake while listening** | Keeps the screen on while audio plays. The battery drains faster. Disabled by default |
| **How much the mark button marks** | Sets whether **Mark the passage** marks the current **Sentence** or **Paragraph**. |
| **How much the note button captures** | Sets whether **Add note…** captures the current **Sentence** or **Paragraph**. |
| **Manage glossary** | Opens the **Pronunciation glossary** dialog. |

With a live voice, a skip goes to the start of a sentence, so the time is approximate. With a recording, a skip is exact.

**Default recording method** is on the **Recorded voice** page. It shows only when both recording methods are enabled. It sets the method that a new recording starts with: **This device (Piper)** or **Server (Kokoro / OpenAI-compatible)**. The **Recordings and mixes** dialog can use a different method for one recording without a change to this setting.

Listening adds a longer pause at paragraph breaks and a clear pause at the end of each chapter.

The live voice, the recorded voice and the **Playback** settings apply only to the device you set them on. The other settings are shared with your other devices. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## Troubleshooting

### Playback pauses or stutters

Set **Read ahead** to **A few sentences**, or select a lighter voice. Orbis voices use a lot of processor time, especially on older phones.

### There is no sound, or the notice *Listening stopped — couldn’t load the voice* shows

Check your network connection, then select **Play** again. The first time a voice speaks, the speech engine downloads. After that, listening works offline.

### Voices on an iPad or iPhone sound robotic, or there are few of them

The system voices on these devices are limited. Download an Orbis voice instead.

---

## See also

- [Marks and Notes](marks-and-notes.md): describes bookmarks, passage selections and notes, including the ones you make while listening
- [Look-up](look-up.md): describes the Look-up dialog, where you select **Pronunciation**
- [Sync and Devices](sync-and-devices.md#settings-shared-between-devices): describes which listening settings are shared between devices
- [Troubleshooting](troubleshooting.md): lists problems and fixes for all features
- [Settings Reference](settings-reference.md): lists every setting
