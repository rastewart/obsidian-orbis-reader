# Test plan — Listening

← [Design Docs](../README.md)

Listening to a book: choosing a live voice, the first-listen prompt, the listening bar and the full-screen player, tracks, acting on what you hear, the **Listening** settings, recordings, mixes, the voice chip and **Voice and source**, the pronunciation glossary, and Pocket mode. What a user sees is in the guide: [Listening](../../guide/listening.md).

**Not here:** **Speak** and **Pronunciation** in the Look-up dialog ([Look-up](look-up.md)), what a mark or note is once made ([Marks and notes](marks-and-notes.md)), and the glossary and recordings reaching another device beyond the per-device facts below. Each belongs to its own page.

Recording steps generate real audio on the device. The two short chapters of `long-chapter.epub` take a minute or two each; nothing here records the long one to the end.

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

- [ ] `each` In **Settings → Orbis Reader → Listening**, write down what **Live voice** says, and every row under **Playback** and **Full-screen audio player**, so Clean up can put them back. They are kept per device, except the two **Full-screen audio player** rows.

- [ ] `once` `fixtures/long-chapter.epub` and `fixtures/no-contents.epub` are in the vault. *Long Chapter* has three chapters: **Chapter One: The Lantern** and **Chapter Three: Morning**, about three minutes each, and **Chapter Two: The Long Night**, about 79 minutes. *No Contents* has four files of text and an empty contents. `fixtures/speech-sampler.epub` is there too, for **How text is read**.

- [ ] `each` Turn on the **`tts`** pill in the debug log: recording runs and track changes are logged there.

---
## Choosing a live voice

- [ ] `once` Open **Settings → Orbis Reader → Listening → Live voice**. It says **The real-time voice that reads your books aloud, and what plays when a book has no recording.**, then **Select live voice**, a choice of **Orbis voices** and **System voices**, a folded **Filter voices**, the voice list, and a button under it.

- [ ] `each` Under **Orbis voices**, choose **Ryan — American English, Male** in the list. Nothing downloads: the button reads **Download · 60 MB**, and going back, **Live voice** reads **Ryan · not downloaded**, with no warning mark. Return and select **Download**: the button reads **Downloading… N%**, then **Generating…**, Ryan says a sample, and the button reads **Preview**. Go back: **Live voice** reads **Ryan**. Select **Hear the live voice**: *This is what it sounds like reading your books.*, in Ryan's voice.

- [ ] `once` Open **Filter voices**: **Gender** and **Accent** for Orbis voices. Choose **Female** and **British English**: the list holds Alba, Cori and Jenny, and **VCTK — British English · Multi-voice** — a multi-voice model has speakers of both genders, so the gender filter keeps it and only the accent filter applies. Clear both.

- [ ] `once` Choose **Libritts — American English · Multi-voice**: the button reads **Download · 75 MB**, and under the list **Voice #**, **‹**, a number, **›** and **of 904** show, grayed out — stepping would play a speaker that is not here. Select **Download**: once it is downloaded, the arrows work. Select **›**: the number becomes 2 and that speaker says a sample at once. Go back: **Live voice** reads **Libritts · 2**. Choose **Ryan** again.

- [ ] `each` No voice picker has a trash: not the **Live voice** page, the reader's **Change voice**, Setup's **Choose a voice**, the **Recorded voice** page's Orbis voices, or **Add recording**. Only **Download** or **Preview** sits under the list.

- [ ] `each` On the **Listening** page, **Downloaded voices** says **Free space on this device by deleting Orbis voices you no longer use.** Select **Manage downloads**: **Downloaded voices** says **Orbis voices on this device.**, then lists each one with its size, and **Total: ~N MB** under the list. Ryan's row reads **~60 MB · Selected live voice**, and its trash is grayed out; pointing at it on a computer says **Select another live voice to delete this one**. **Done** closes it.

- [ ] `desktop` Choose **System voices** and any voice under **Live voice**, then open **Downloaded voices**: no trash is grayed out. Select Ryan's: **Delete Ryan?** with **This frees ~60 MB on this device.** Select **Delete**: Ryan leaves the list. Choose **Orbis voices** and Ryan again: nothing downloads — the button reads **Download · 60 MB**, and **Live voice** reads **Ryan · not downloaded**. Select **Download** to have Ryan back.

- [ ] `once` With Ryan also the Orbis voice on the **Recorded voice** page, and another live voice chosen, delete Ryan in **Downloaded voices**: the question adds **It is your voice for new recordings, so the next recording will ask for it.** Select **Cancel**, and choose Ryan as the live voice again.

- [ ] `android` In **Downloaded voices**, the live voice's trash is grayed out and every other voice's can be selected — there is no system voice to switch to, so one Orbis voice always stays.

- [ ] `desktop` Turn off the network, choose a voice not yet on this device, and select **Download**: the line under the list says **Download failed. Check your connection and try again.** — not anything about a server — and the button reads **Download · 60 MB** again. Turn the network back on and choose Ryan.

- [ ] `android` The **Live voice** page has no **System voices** choice: a heading reads **Orbis voices**, and only Orbis voices are listed.

- [ ] `each` On the Mac, iPhone and iPad, choose **System voices**: the description reads **Voices provided by your operating system. No download needed; availability varies by device.**, and the list shows the voices this device has installed, as *Name — Language*, each name once — iOS installs some voices at two qualities, and only the better one is listed. Choose one: **Live voice** reads its name, and **Hear the live voice** speaks in it. Choose **Orbis voices** and Ryan again.

- [ ] `each` The live voice is per device: choose **Joe** on the Mac and select **Download**, and the iPhone still reads **Ryan**. Choose Ryan on the Mac again.

---
## The first time on a device

- [ ] `desktop` Make Ryan a live voice that is not on this device: choose another voice, delete Ryan in **Downloaded voices**, and choose Ryan again. Open `long-chapter.epub` and select **Listen** on the toolbar. **Listen needs a voice** opens: *Download a natural-sounding voice to hear your book read aloud. It stays on this device and works offline.*, then **Your voice: Ryan · ~60 MB**, with **Browse voices**, **Use a system voice** and **Download and listen**. Close it with **×**: no listening bar opens.

- [ ] `desktop` Select **Listen** again, then **Browse voices**: the **Live voice** picker opens over the book. Select **Done** without choosing: nothing opens. Select **Listen**, then **Download and listen**: it says **Downloading… N%**, then closes, the listening bar opens and reading starts.

- [ ] `android` Make the live voice one that is not on this device, as above, and select **Listen**: **Listen needs a voice** has **Browse voices** and **Download and listen**, and no **Use a system voice**. Download and listen.

- [ ] `ipad` Make the live voice one that is not on this device, as above, and select **Listen**, then **Use a system voice**: the bar opens, reading starts in a system voice, and a notice says **Listening with your system voice. Prefer another? Settings → Listening.** Close the bar. In **Settings → Listening**, **Hear the live voice** speaks the sample in that system voice. Choose Ryan again under **Live voice**.

- [ ] `once` Make the live voice one that is not on this device, as above. In a book, select a word, choose **Look up**, then **Speak**: **Listen needs a voice** opens over the Look-up dialog, with **Browse voices**, **Use a system voice** where the device has system voices, and **Download and listen**. Close it: nothing downloads, no error appears, and the Look-up dialog stays. Select **Speak** again, then **Download and listen**: the Look-up dialog stays open behind it, and when the download finishes the word is spoken. Nothing anywhere in Orbis Reader downloads a voice without this question.

- [ ] `once` On a device with no voice downloaded, **Settings → Orbis Reader → Setup** shows **Listening** with **Choose**. Select it: **Choose a voice** opens with the same picker, on the voice this device last chose — **Amy** if it never chose one — and nothing downloads. The button beside the list reads **Download · 60 MB**, and the footer has **Done**. Select outside the dialog: it stays open. Select **Done**, or close with **×**: nothing downloads, and the row still reads **Choose**.

- [ ] `once` Select **Choose** again, then **Download** beside the list: it downloads and plays a sample, and the button reads **Preview**. Select **Done**: the row reads **Ready**.

---
## The listening bar

- [ ] `each` Open `long-chapter.epub` at **Chapter One: The Lantern** and select **Listen**. The bar opens between the toolbar and the page, holding, left to right, the headphones, the voice chip, **↺**, **▶** and **↻**. Nothing plays until you select **▶**.

- [ ] `each` Select **▶**: reading starts at the top of the page, the sentence being read is highlighted, and the page turns as it goes. **⏸** pauses; **▶** carries on from the same sentence.

- [ ] `desktop` The buttons' tooltips are **Show player**, **Back 15 seconds**, **Play** or **Pause** and **Forward 15 seconds**.

- [ ] `each` While playing, select **↻**: reading moves on roughly fifteen seconds and starts at the beginning of a sentence. **↺** goes back the same way.

- [ ] `each` Play, and select the voice chip: in **Voice and source**, **Speed** is under **Voice**, a slider with a number box and **×** beside it. Drag it to 1.5: the voice speeds up as you drag, and the box reads **1.5**. Type **2** in the box: the slider moves and the voice speeds up. Type **9** and leave the box: it settles on **3**. Close it: the voice chip on the bar and in the full-screen audio player reads **1.5×** after the voice name. Close and reopen the book: still **1.5×**. Set it back to **1×**.

- [ ] `phone` Select a recording or mix with a long name in **Voice and source**. On the listening bar, the chip shows the voice and the name without the speed, rather than cutting the name short; the full-screen audio player's chip shows all three. Select **None — use the live voice**: the bar's chip shows the speed again.

- [ ] `phone` On the listening bar, **↺**, **▶** and **↻** are full-size circles with room around **▶**, and tapping **▶** repeatedly never presses a skip instead. The bar is no taller than the search bar, and the first line of the page shows under it, as before.

- [ ] `each` Select **Listen** on the toolbar again: the bar closes and reading stops.

- [ ] `once` In Focus mode the bar has an **×** at its end. Select it: the bar closes and reading stops.

---
## The full-screen player

- [ ] `each` Open the bar and select the headphones. The player shows the book's cover, **Long Chapter**, **Orbis Tester**, the track **Chapter One: The Lantern**, the voice chip, a progress bar with three times under it, **⏮ ↺ ▶ ↻ ⏭**, and a row of five icons. The chevron at the top left returns to the text.

- [ ] `each` Under the progress bar: on the left, the time into this track; in the middle, **~… left** for the whole book — over an hour and a half here; on the right, the time left in this track with a minus sign. The times are in whole minutes, with seconds only under a minute, so play for a minute or two: the left time rises and the right one falls.

- [ ] `each` Drag the progress bar to the middle and let go: reading continues from about halfway through the track.

- [ ] `desktop` Focus the progress bar. **→** moves about ten seconds on and **Shift+→** about a minute, each to the start of a sentence, since a live voice starts only there. **Home** goes to the start of the track, and **End** to the start of its last sentence, a few seconds from the end.

- [ ] `each` Select **⏭**: the track becomes **Chapter Two: The Long Night 1 of 3**, and the right-hand time reads about **−26m**. **⏭** again: **2 of 3**, then **3 of 3**, then **Chapter Three: Morning**. **⏮** steps back one track at a time, and on the first track it does nothing.

- [ ] `each` Select **Listen** while the player is showing: the player and the bar close, and reading stops.

---
## Tracks

- [ ] `once` Open `no-contents.epub` and let it finish opening. Open the player: the track reads **No Contents 1 of 4**. **⏭** steps through **2 of 4**, **3 of 4** and **4 of 4**, each a few minutes long.

- [ ] `once` In `long-chapter.epub`, the **Contents** tab lists **Chapter Two: The Long Night** once, while the player steps through it as three tracks.

---
## Acting on what you hear

- [ ] `desktop` In the player, the four icons under the transport have, left to right, the tooltips **Marks for listening and notes**, **Mark the passage**, **Add note…** and **Bookmark**, and there is no speed button.

- [ ] `each` While playing **Chapter One**, select the bookmark icon: **Bookmark added**. Select it again on the same sentence: **Bookmark removed**. Add it once more. On the **Annotations** tab, the bookmark has a headphones icon; selecting it jumps to the sentence and flashes it.

- [ ] `each` Select **Mark the passage**: the sentence being read becomes a passage selection, with the mark chosen for **Passage selections**, and reading carries on with no notice. Select it again on the same sentence: **There's already a selection or note here.**

- [ ] `each` Select **Add note…** while playing: reading pauses and the note editor opens with the sentence's text. Save the note: reading resumes. Do it again and cancel: reading resumes too.

- [ ] `once` Select **Marks for listening and notes**: *Select which mark is used for:*, then **Passage selections** and **Notes**. Open **Notes**: its list starts with **Unmarked**. Choose **Unmarked**: the note icon in the player turns muted, and a note added now has no mark. **Manage marks** opens the **Marks manager** for the book, and this one returns when it closes. Set **Notes** back.

- [ ] `once` In **Settings → Listening**, set **How much the mark button marks** to **Paragraph**: **Mark the passage** now marks the whole paragraph. On another device, the row reads **Paragraph** too — these two rows sync. Set it back to **Sentence**.

---
## Navigating while listening

- [ ] `each` While playing **Chapter One**, open the contents and select **Chapter Three: Morning**: reading jumps there and goes on playing.

- [ ] `each` While playing **Chapter Two**, select the search icon: the search bar replaces the listening bar, reading pauses, **Listening paused** appears, and the sentence being read stays highlighted. Search for **lantern**: the book moves to the first hit, and the listening highlight clears. Step to another hit. Select **Listen**, then **▶**: reading starts at the sentence holding the hit the search left you on.

- [ ] `each` While playing, open the display style bar: the listening bar goes away, the audio pauses, and a notice says **Listening paused**. Make the text much larger, then close the display style bar. Select **Listen**: the listening bar comes back, paused. Select **▶**: reading carries on with the same sentence, and the page turns to keep it on screen.

- [ ] `once` While playing, change **Font size** in **Settings → Orbis Reader → Appearance** instead: the audio pauses with the same notice as the book is laid out again. Close Settings and select **▶**: reading carries on with the same sentence. Set the font size back.

- [ ] `each` While playing, run **Go to next chapter** from the command palette, or select it where the device offers it: reading moves to the next chapter, as selecting it in the contents does.

- [ ] `each` While playing, open the search bar and close it again without searching: the listening bar stays hidden and nothing plays. Select **Listen**: the bar is back, paused, and **▶** resumes from the same sentence. The same for the Go to bar and the display style bar.

- [ ] `each` With the listening bar, play into **Chapter Three**, pause in the middle of a page, and close the book's tab. Open the book again: it opens on that page. Select **Listen**, then **▶**: reading starts at the sentence where it paused, not at the top of the page.

- [ ] `each` Do the same in the full-screen player: pause mid-page, close the tab, reopen, and **▶** starts at the paused sentence.

- [ ] `once` Pause mid-page, close and reopen the book, then turn two pages forward before selecting **▶**: reading starts at the top of the page you turned to — turning pages is choosing where to listen from.

- [ ] `desktop` While playing, the Mac's **Now Playing** in Control Center shows **Long Chapter**, **Orbis Tester** and the track. On Windows, the media panel in quick settings shows **Long Chapter**, **Orbis Tester** and the book's cover, under **Unknown app**, which is how Windows names Obsidian; it has no line for the track. On either, the keyboard's play/pause key pauses and resumes, and next-track moves to the next track.

- [ ] `android` While playing, no media notification or lock-screen controls appear for Orbis Reader.

---
## Listening settings

- [ ] `once` **Settings → Orbis Reader → Listening** lists **Live voice**, **Hear the live voice**, **Recorded voice** and **Hear the recording voice**; then under **Playback**: **Rewind button** and **Forward button** (5 to 60 seconds, 15 to start with), **Read ahead** (**Sentence**, **A few sentences**), **Highlight while reading** (**Off**, **Word**, **Sentence**, **Paragraph**), **Always use the live voice** (off) and **Keep screen awake while listening** (off); then **Full-screen audio player** with its two rows, and **Pronunciation glossary**.

- [ ] `each` Set **Rewind button** to **5 seconds**: the bar's **↺** tooltip or label reads **Back 5 seconds**, and it moves back a sentence or so. Set it back.

- [ ] `each` Set **Highlight while reading** to **Word**: the word being read is highlighted within the sentence. **Paragraph**: the whole paragraph is highlighted and stays still from sentence to sentence. **Off**: nothing is highlighted, and the page still turns with the reading. Set it back to **Sentence**.

- [ ] `mobile` Turn on **Keep screen awake while listening** and play past the device's auto-lock time: the screen stays on. Pause and wait: it locks as usual. Turn it off.

- [ ] `once` The **Playback** rows are per device: change **Forward button** on the Mac, and the iPhone keeps its own. Set it back.

---
## Recordings

These use `long-chapter.epub` and the on-device engine — **Settings → Listening → Recorded voice** shows it **Active**, voice **Amy**.

- [ ] `desktop` From the reader's **⋯** menu, select **Manage recordings and mixes…**. **Recordings and mixes** opens: *A recording uses one voice; a mix can use several. Open one to manage it, or add a new one.*, then **No recordings or mixes yet. Record a voice, or build a mix from live voices.**, with **Add recording**, **Add mix** and **Close**.

- [ ] `desktop` Select **Add recording**: **Add recording**, *Pick the voice to record with.*, **Back**, the voice picker on **Amy**, then **Select all**, **Clear** and **Invert** over five tracks, every one ticked, each with an estimate such as **~3 min · ~1.1 MB**. **1 track holds no text, so it is not listed.** — the cover page.

- [ ] `desktop` Select **Clear**, then tick **Chapter One** and **Chapter Three**: the button reads **Generate (2)**. Select it: **Generate recording?** with **2 tracks with Amy — American English, Female** and an estimate of the time, or **This can take a long time — potentially hours for a full book.** if this device has never recorded. Select **Generate**.

- [ ] `desktop` While it records: **Voice:** Amy, **0 of 2 tracks recorded**, *Recording will continue in the background if you close this dialog…*, **Recording: Chapter One: The Lantern — N/M sentences**, and the row reading **Recording… N%**. Select **Pause**: **Paused. Everything recorded so far is kept.** Select **Resume**: it carries on.

- [ ] `desktop` Select **Close**. A chip on the book reads **Recording… 1/2** or similar; selecting it reopens the dialog. Close it again, open **Settings**, and wait there for the recording to finish: **Recording: 2 tracks recorded in Ns**, nothing opens in Settings, and the chip on the book now reads **Recorded 2/2** with a tick. Close Settings: the dialog opens over the book on **Recorded 2 tracks in …**, and the chip goes. (Had the book's window been in front with nothing open over it, the dialog would have opened as soon as the recording finished.) **Continue** goes to the list: **Amy — American English, Female**, **2 of 5 tracks · N MB**, **Recording**, ticked as the one in use.

- [ ] `desktop` In Finder, every folder under a `!orbis-data/audio/` is named after its book with `.audio` — `long-chapter.epub.audio`, not `long-chapter.epub` — and opens as an ordinary folder, not an EPUB. Recordings made before this build were renamed the first time Orbis Reader started with it, and still play.

- [ ] `desktop` In the vault, `fixtures/!orbis-data/audio/long-chapter.epub.audio/` holds `editions.json` and a folder named `piper-ondevice__piper__en_us-amy-medium` with two `ch….mp3` files, `manifest.json` and `long-chapter.m3u`.

- [ ] `desktop` Open the recording with its pencil: **Edit recording**, with the three **Long Night** tracks ticked and the two recorded ones carrying **▶** and a trash. Select **▶** on **Chapter One**: it plays. Select **Generate (3)**, **Generate**, and then **Stop**: **Stop recording?** — *The chapter in progress won't be saved. Chapters already recorded are kept.* — with **Keep recording** and **Stop**. Select **Stop**: **Recording: cancelling…**, and the list still says **2 of 5 tracks**.

- [ ] `desktop` In **Edit recording**, select the pencil beside the name: **Rename recording**. Name it **Night reads** and select **Update**: the header reads **Recording: Night reads**, and the line under it starts with the voice — **Amy — American English, Female · 2 tracks recorded**. Select **Back**: the row reads **Night reads**, then **Amy · 2 of 5 tracks · …**. Rename it with the name empty: it goes back to the voice's name. Name it **Night reads** again.

- [ ] `each` Play `long-chapter.epub` from **Chapter One** in the player: the voice chip shows a microphone and **Amy · Night reads**. Select **⏭**: on **The Long Night 1 of 3**, broadcast arcs and **Ryan · (Night reads)** — the live voice, because the track is not recorded.

- [ ] `each` On a recorded track, **↻** moves exactly fifteen seconds, mid-sentence if that is where it lands. On **Chapter One**, the middle time counts the whole book, the unrecorded chapter included — over an hour.

- [ ] `once` On a recorded track, set **How much the mark button marks** to **Paragraph**, select **Mark the passage**, then **Add note…** on another paragraph and save the note. Both paragraphs are marked in the book, and **Scan annotation data for problems** finds nothing. Before 0.1.7 both were saved with an empty range and showed nothing. Set the mark button back to **Sentence**.

- [ ] `desktop` In **Edit recording**, select the trash on **Chapter Three**: **Delete this track?** — *“Chapter Three: Morning” loses its recorded audio, and plays in the live voice until it is recorded again.* Select **Cancel**: nothing changes. Select the trash again and **Delete**: **Deleted**, and the list says **1 of 5 tracks**. Record **Chapter Three** again.

- [ ] `once` On a device with no voice downloaded, open `long-chapter.epub` at **Chapter One**, with **Night reads** the source and synced from the device that recorded it, and select **Listen**: no **Listen needs a voice** — the bar opens, and **▶** plays the recording. Select **⏭**: on **The Long Night 1 of 3**, which has to be read live, **▶** asks for a voice.

- [ ] `mobile` On one phone or the iPad, open **Manage recordings and mixes…** and record **Chapter Three** with **Add recording** — a second voice, since Amy is taken. It records, and plays from the player.

- [ ] `once` If you have an OpenAI-compatible speech server: in **Recorded voice**, turning **Server** on with no address says **Give the server an address first.** Give it the address: **Default server voice** lists its voices. Turn it on: **Default recording method** appears, with **This device (Piper)** and **Server (Kokoro / OpenAI-compatible)**. **Add recording** now offers both. Record **Chapter One** with the server. A voice the server refuses is reported as refused, not as a server that cannot be reached — that is covered by `server-synth-refusal.test.ts`, since a server that lists its voices offers no way to choose one it lacks.

---
## Voice and source

- [ ] `each` Select the voice chip: **Voice and source**. Under **Voice**, the voice and a line saying why — **From your recording selection.** on a recorded track, **Your live voice — this track has no recording.** on **The Long Night**. Under **Source**, a list starting **None — use the live voice**, then **Night reads**; and **Recorded: 2 of 5 tracks**. **Manage recordings and mixes** opens the recordings dialog, and this one returns when it closes.

- [ ] `each` **Change voice** appears only while the live voice is the one speaking: on **The Long Night** it is there; on **Chapter One** it is not. Select it on **The Long Night**: **Voice and source** closes and the **Live voice** picker opens on its own — one **Done** on screen. Tap or select outside the picker: it stays open. Choose another voice and select **Done**: **Voice and source** comes back once, showing the voice you chose, with every block drawn one time. Choose Ryan again.

- [ ] `each` Set **Source** to **None — use the live voice**: on **Chapter One** the chip shows arcs and **Ryan**, with no second name. Set it back to **Night reads**.

- [ ] `each` Turn on **Always use the live voice**: on **Chapter One** the chip reads **Ryan · (Night reads)**. **Voice and source** says **Your live voice — always-live is on.**, the **Source** list is grayed out, and under it: *Always use the live voice is on, so recordings and mixes don’t play. Turn it off in Settings → Listening.* Turn it off: **Source** can be changed again, still on **Night reads**.

- [ ] `once` **Choose listening voice…** in the command palette opens **Voice and source** too.

- [ ] `each` At the foot of **Voice and source**, under *More listening options are in settings.*, select **Open Listening settings**: the dialog closes and Settings opens on the **Listening** page, with a back arrow. Close Settings: the book, with no dialog over it.

- [ ] `once` On a device with no voice downloaded and no recording for the book, the chip reads **No voice**; **Voice and source** says **No voice on this device** and **Your selected voice isn't on this device — choose a voice to start listening.**, with **Choose a voice**.

---
## Mixes

- [ ] `desktop` In **Recordings and mixes**, select **Add mix**: **New mix**, with **Enter mix name**. Name it **Two voices** and select **Create**: **Mix: Two voices**, with **Source**, **Add live voice** and **Use for selected (0)**. Every track reads **Default live voice**. Select **Back**: the tick is still on the recording or mix that was selected before — creating a mix doesn't select it. Open **Two voices** again.

- [ ] `desktop` Select **Add live voice**: **Add a live voice**. Choose **Joe** and select **Add live voice**: Joe is in **Source** as a live voice, and **Default live voice** is last.

- [ ] `desktop` **Source** lists **Night reads (Amy — American English, Female) · recording**: a named recording shows its name and its voice, an unnamed one only its voice. With **Source** on it, only **Chapter One** and **Chapter Three** can be ticked. Tick both and select **Use for selected (2)**: **2 tracks set to …**, and both rows read **Recorded**. Set **Source** to Joe, tick **The Long Night 1 of 3**, and **Use for selected (1)**: **1 track set to …**, **Live**. Select **▶** on that row: Joe reads its first sentence.

- [ ] `each` In **Voice and source**, set **Source** to **Two voices** and play from **Chapter One**: a microphone and **Amy · Two voices**. **⏭**: arcs and **Joe · Two voices**. **⏭** again: **Ryan · (Two voices)**, and **Voice and source** says **Your live voice — this track uses the default.** Under **Source**, **Recorded: 2 of 5 tracks** — the two tracks the mix plays from a recording.

- [ ] `each` On a device without Joe, whose own live voice is on it and isn't Joe, play into **The Long Night 1 of 3** with **Two voices**: **The voice this mix uses for this track, Joe…, isn't on this device. Using your live voice.** The chip shows the live voice with **(Two voices)**, and **Voice and source** says **Your live voice — this track's voice isn't on this device.** Play into that track again: the notice does not repeat.

- [ ] `once` With **Two voices** selected, turn on **Always use the live voice**: **The Long Night 1 of 3** is read in the live voice, not Joe. Turn it off.

- [ ] `desktop` Delete **Two voices** from the list: **Delete mix?** — *Delete this mix? The recordings it points to are kept.* After **Delete**, **Night reads** is still listed, and the tick is on **None — use the live voice**: deleting what was selected selects None, not another recording.

- [ ] `desktop` Delete **Night reads** with its trash: **Delete files?** — *Permanently delete Night reads? All of its recorded audio goes with it, and this cannot be undone.* After **Delete**, **Deleted**, and its folder under `!orbis-data/audio/` is gone.

---
## Pronunciation glossary

- [ ] `once` In **Settings → Listening**, the glossary row reads **No respellings yet**, or how many there are. Select **Manage glossary**: **Pronunciation glossary**, with *Replacements are applied just before the voice speaks.*, **Find or add a word** and **Add** above the list. With no entries, the list says to add one **above**.

- [ ] `once` Type **Esker** and select **Add**: **Say “Esker” as**. Type **ESS ker**, select **▶ Live (Ryan)**: *I will say Esker now.*, as spelled. Select **Save**: the row shows **Esker** with **ess ker** under it — respellings are kept in lower case — ticked **Active**, and the settings row reads **1 respelling**.

- [ ] `once` Play `long-chapter.epub` from the start of **Chapter One**: *said Esker* is spoken as respelled. Untick **Active** in the glossary: it is said as before. Type **esker esker** in the field and **Add**: **Enter a single word — no spaces.**

- [ ] `once` Delete **esker** with its trash. The settings row reads **No respellings yet**.

---
## How text is read

`fixtures/speech-sampler.epub` has one chapter for each way Orbis Reader rewrites text before a voice reads it. Most cases appear twice: in a sentence, then on a line of their own, because a voice can read the two differently. The readings below are for Orbis voices, which all receive the same text; system voices and a Kokoro server read text their own way. A reading marked *known* is how it is read today. To change one for your books, respell it in the glossary and play the line again.

- [ ] `once` Open `speech-sampler.epub` and listen from **Two-Letter Capitals**. AI, IT, UI, ID, TV, PC, US and OK are spelled letter by letter, in their sentences and on their own lines. UX and AM are spelled in their sentences, but on their own lines are read as the words *ux* and *am* (known).

- [ ] `once` **Initialisms**: FBI, USA, HTML, IBM, API, GPU, URL, RIAA and IEEE are spelled, both ways. AWS is spelled in its sentence and read as the word *awz* on its own line (known).

- [ ] `once` **Capitals Read as Words**: NASA, FUD, SCUBA and UNESCO are read as words, and CIA is spelled. MIT is read as the word *mitt* (known: the capitals are changed to *Mit* before the voice sees them).

- [ ] `once` **Headings in Capitals**: CHAPTER ONE, PROLOGUE, THE LONG NIGHT, KEEP OUT and THE END are read as ordinary words, not spelled out. *IT WAS A DARK NIGHT* is read *it was a dark night*, and *IT was nearly midnight* starts *it was*, not *I-T*. *HENRY VI WAS KING* is read *Henry the Sixth was king*.

- [ ] `once` **Plurals, Possessives and Dots**: AIs, AI's, URLs and AWS's are spelled with the *s* on the end. A.I. and U.S.A. are spelled, *e.g.* is read *for example*, and PhD is spelled. *i.e.* is read as the letters *I-E*, and Ph.D. is read with its dots, *P-H dot D dot* (both known).

- [ ] `once` **Roman Numerals**: after Chapter, Part, Book, Volume, Act, Scene, Canto and Section, the numeral is read as a number — *Chapter four*, *Chapter one*, *Part two*, *Book three*, *Volume twelve*, *Act five, Scene two*, *Canto nine*, *Section forty*. *I think I can* keeps the word *I*. After a ruler's name or a title, the numeral is an ordinal: *King George the Third*, *Louis the Fourteenth*, *Emperor Talvar the Fourth*. After anything else it is a number: *World War two*, *Article four*. *Malcolm X* is read as written, with no *roman* and no *tenth*.

- [ ] `once` **Web and Email Addresses**: each address is read as *web link* or *email link* and its site, with the dots spoken and the rest of the address left out — *web link example dot com*, *web link example dot org*, *web link example dot net*, *email link example dot com*. *example.com*, with no path and no `www.`, is read *example dot com*. *Or email `help@example.com`* says *email email link* (known).

- [ ] `once` In the glossary, add **AI** said as **eh eye**, and play *Ask the AI for help.* again without closing the book: it is read with the new respelling, not a copy of the old reading. Untick **Active** and play it again: back as before. Delete the entry.

---
## Pocket mode

- [ ] `mobile` Open the full-screen audio player, out of Focus mode, and play. An open lock shows at the top right, across from the **Show text** chevron at the top left. Select it: Focus mode turns on, the transport and the action icons go, the screen turns near black, and **Controls locked** and *Slide the lock up to unlock* show beside a lock at the bottom right. Touching anywhere else does nothing, and reading goes on.

- [ ] `phone` With **Keep screen awake while listening** off, lock the controls while playing and leave the phone past its auto-lock time: the screen stays on, dimmed, and the audio keeps playing. Unlock and wait again: the screen turns off as usual.

- [ ] `mobile` Play, then press the side or power button to turn the screen off, and turn it back on. On iPhone and iPad the audio has paused and the button shows **Play**; select it and the audio goes on from the same sentence. On Android, note whether the audio kept playing.

- [ ] `phone` Slide the lock part of the way up and let go: it springs back. Slide it all the way up: no notice appears, the controls are back, and Focus mode is off again — the player as it was before you locked it.

- [ ] `mobile` Turn on Focus mode with the full-screen audio player open: the open lock sits below the **Exit focus mode** button, in the style of the other player buttons. Lock, then slide to unlock: Focus mode stays on.

- [ ] `mobile` Show the text, so the listening bar is open, and pause. Run **Lock listening controls** from the command palette: the full-screen audio player opens in Focus mode, locked, and the audio stays paused. Unlock: the book's text is back with the listening bar, and Focus mode is off.

- [ ] `desktop` The full-screen audio player has no lock at its top right. With the player open, run **Lock listening controls**: it locks, in Focus mode, as on a phone. Run it again: it unlocks and leaves Focus mode.

- [ ] `once` Close the listening bar: the command palette has no **Lock listening controls**.

---
## Clean up

- [ ] `once` In **Recordings and mixes** for `long-chapter.epub`, delete any recording or mix left from this run, on each device that made one. Delete the bookmarks, marks and notes it made in `long-chapter.epub`.

- [ ] `each` Put **Live voice** and every **Playback** and **Full-screen audio player** row back as you wrote them down. In **Downloaded voices**, delete Libritts, Joe and any other voice this run downloaded that you do not want to keep. Turn off the **`tts`** pill.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
