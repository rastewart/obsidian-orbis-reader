# Test plan — Notes to EPUB

← [Design Docs](../README.md)

Turning notes into books: **Save note as EPUB…** for one note, **Save folder as EPUB…** and **Save folder notes as EPUBs…** for a folder, and **Read in Orbis Reader**, which converts a note and opens it without asking anything. What a user sees is in the guides: [Notes to EPUB](../../guide/notes-to-epub.md) and [Read in Orbis Reader](../../guide/read-in-orbis-reader.md).

**Not here:** reading the book once it is made ([Reading a book](reading-a-book.md)), marking it ([Marks and notes](marks-and-notes.md)), and the other direction, a book into notes ([Conversions](conversions.md)). Each belongs to its own page.

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

- [ ] `once` The sample notes are in `fixtures/notes-to-epub`: **Kitchen Sink** (one note holding every kind of Markdown), **Clipped Article** (shaped like a web clip), and the **Field Guide** folder (an index note, five chapters and an `Archive` subfolder). Each note says in its own text what to expect of it.

- [ ] `once` In **Settings → Orbis Reader → Conversions → Save as EPUB**, write down what the rows say, so Clean up can put them back. Set **Default folder for EPUB files** to **Beside the note or folder**, **Chapter breaks** to **Heading 2**, and turn **Fetch remote images by default** off.

- [ ] `once` Delete anything an earlier run wrote in `fixtures/notes-to-epub`: `Kitchen Sink.epub`, `Clipped Article.epub` and any `Clipped Article - v002.epub` after it, `Field Guide.epub` beside the folder, and a `Field Guide-EPUB` folder. Delete their files in `fixtures/notes-to-epub/!orbis-data` too, so annotations from an earlier run cannot carry over.

---
## Save note as EPUB: the dialog

- [ ] `each` Open the context menu on **Kitchen Sink** in the **Files** pane — right-click, or long-press on a touch screen — and choose **Save note as EPUB…**. The dialog opens titled **Save note as EPUB**. While it reads the note it says **Reading the note…**, and **Save** is unavailable until it has.

- [ ] `each` The line at the top reads **Title: Kitchen Sink (frontmatter title)**, from the note's frontmatter, not its file name. The **Save to** fold's header shows `fixtures/notes-to-epub/Kitchen Sink.epub`: the file is named after the note, not the title, and sits beside it.

- [ ] `each` Open **Save to** and change the file name to **Kitchen: test?**. The header shows **Kitchen test.epub**, with the colon and question mark turned into spaces. Change it back to **Kitchen Sink**.

- [ ] `each` Clear the file name. The field shows **Kitchen Sink** in gray, and the header still shows `fixtures/notes-to-epub/Kitchen Sink.epub`. Type **Kitchen Sink** back.

- [ ] `each` The **Book details** fold's header lists what is filled in. Open it: **Author** reads **O. Tester** — the frontmatter author is a link with an alias, and the alias is the name — **Publisher** reads **Orbis Reader Fixtures**, **Language** **en**, and **Publication date** **2026-04-02**.

- [ ] `mobile` In **Book details**, select the **Title** field. It moves above the on-screen keyboard and shows a blinking insertion point. On the iPad, rotate it: still above the keyboard, and the insertion point still shows. Leave the title unchanged.

- [ ] `each` **Chapter breaks** is on **Heading 2**, and its dropdown lists only the levels the note has, each with how many headings it holds. Below it, **N chapters** lists them: the first is named after the book, since the note's opening paragraphs come before any heading, then **Text and emphasis**, **Notes**, **Lists, tasks and callouts**, **Tables**, **Links**, **Images and embeds**, **Left out or empty**, and a second **Notes**.

- [ ] `each` Choose **Heading 3** under **Chapter breaks**: the list grows by the one third-level heading, **A heading with punctuation: commas, "quotes" & ampersands?**. Choose **None — one chapter**: the list is one chapter. Choose **Heading 2** again.

- [ ] `each` **Fetch 4 remote images** is offered, off: the note has an image and a raw `<img>` hosted on the web, and the **Clipped Article** it embeds has two more. Below, **Not everything carries over** lists exactly four lines: **4 images hosted on the web will be left out.**, **1 image could not be found in your vault.** (`missing.png`), **4 links become plain text.** (**Clipped Article**, **Missing Note**, the heading that does not exist and the `obsidian://` link — not the tag, and not the block link) and **3 drawings or formulas will be left out.** (the two formulas and the Mermaid diagram). Turn the remote images on: the first line goes. Turn them off again.

- [ ] `once` Open **Save note as EPUB…** on **Field Guide → 004-Tools**, which has no headings: **Chapter breaks** says **There are no headings to break at, so the book is one chapter.** Cancel.

---
## Save note as EPUB: the book

- [ ] `each` On **Kitchen Sink**, select **Save**. `Kitchen Sink.epub` appears beside the note. Open it.

- [ ] `once` The book's contents list the nine chapters above, the first named after the book. Its text keeps what the note says it keeps: emphasis, the hard-wrapped lines each ending in a break, the code fence with its `[[Not a link]]` as text, the callouts as boxes, the table, both footnotes linking down and back, and both images, the same picture stored once.

- [ ] `once` In **Links**, the links to **Tables** and **Notes** go to those chapters, and **To a block in this note** lands on the paragraph that ends the section, and that paragraph no longer ends with `^blk`. The link itself reads `^blk`, as it does in the note. **Clipped Article**, **Missing Note** and the tag are plain text. The web links open the browser.

- [ ] `once` In **Images and embeds**, `missing.png` leaves nothing behind, not a message saying it could not be found. The embedded **Clipped Article** and its **Section Two** are there as text, with no block of its properties above them.

- [ ] `once` In **Left out or empty**, the formulas and the Mermaid diagram are gone, with no **Display Mermaid diagrams in this vault?** in their place. The Dataview query is a code block, since the Dataview plugin is not installed. **A details element** is a bold line of its own, with **Its text should survive.** after it.

- [ ] `each` Mark a passage in the book. Open **Save note as EPUB…** on **Kitchen Sink** again and select **Save** without changing anything. Nothing asks, and a notice says **Kitchen Sink.epub is already up to date.** The book's file is untouched: its modified time in the **Files** pane is unchanged.

- [ ] `once` Open **Save note as EPUB…** on **Kitchen Sink** again, change **Author** under **Book details**, and select **Save**. Nothing asks, since the text is the same, and the notice says **Saved Kitchen Sink.epub.** The passage selection is still where it was.

- [ ] `each` Add a sentence to the end of the **Text and emphasis** section of **Kitchen Sink**. Open **Save note as EPUB…** and select **Save**. It asks **Replace this EPUB?**: **The previously generated EPUB has annotations, and the source changed after generation. Annotations are kept, however they may be in the wrong place when it is regenerated.** Cancel, and nothing is written. Remove the sentence.

- [ ] `desktop` Open **Save note as EPUB…** on **Kitchen Sink** again. The footer has **Export…** at the left, apart from **Cancel** and **Save**. Select **Export…**: the system save dialog opens with **Kitchen Sink.epub**. Cancel it: the dialog is still open, as you left it.

- [ ] `desktop` Select **Export…**, select a folder outside the vault, and save. The dialog closes, nothing asks about the book in the vault, and the notice gives the whole path. Open that EPUB in another reading app: its chapters and links work. In the vault, `Kitchen Sink.epub` is untouched — its modified time in the **Files** pane is unchanged — and no title note is written.

- [ ] `mobile` Open **Save note as EPUB…** on **Kitchen Sink** again. The footer has **Share…** at the left and **Cancel** and **Save** at the right, all on one line. Select **Share…**: the dialog closes and the share sheet opens. Send the EPUB to another app, such as a messaging app: it arrives, and it opens. Nothing in the vault changed.

- [ ] `android` In that share list, the apps that open an EPUB come first, and **Android Share** opens the full list of apps to send it to.

---
## Save folder as EPUB

- [ ] `each` Open the context menu on the **Field Guide** folder. It offers **Save folder as EPUB…** and **Save folder notes as EPUBs…**. Open the menu on the `attachments` folder, which holds no notes: neither is offered.

- [ ] `each` Choose **Save folder as EPUB…** on **Field Guide**. The dialog opens titled **Save folder as EPUB**. The line at the top reads **Title: Field Guide (frontmatter title)**, from the index note `001-README`. The **Save to** fold's header shows `fixtures/notes-to-epub/Field Guide.epub`: beside the folder, not inside it.

- [ ] `each` Open **Notes to convert**. **Chapter order** reads **001-README**, the index note, by its file name. The rows are named as their chapters will be, and numbered, in the order the index note's links give: **1. Field Guide** (the index note itself), **2. Tools**, **3. Getting Started (frontmatter title)** and **4. Trails and the guide**, with **Tools** listed once although the index links to it twice. The two notes it does not link to follow in number order, the long **Part Two** note and then **Appendix**, with a line saying **2 notes are not linked from “001-README”, so they go at the end in file name order.** **Old Draft**, in the `Archive` subfolder, is not listed.

- [ ] `each` Move **Appendix** up one place with its **↑** button. **Chapter order** now reads **001-README (customized)**, and **001-README** is still in its list. Choose **File name order**: the rows go into number order. Choose **001-README** again: its order comes back.

- [ ] `desktop` Drag **Trails and the guide** above **Tools**. The list follows, and **Chapter order** reads **001-README (customized)**. Choose **001-README** again.

- [ ] `each` Untick **Appendix**. It stays in the list, grayed, in its place, with **—** where its number was, and the fold's header counts one chapter fewer. Tick it again.

- [ ] `each` Select **Save**. `Field Guide.epub` appears beside the folder. Open it.

- [ ] `once` The contents list a chapter per note, in the order chosen: **Field Guide**, **Tools** (named from its file name, without the number), **Getting Started (frontmatter title)** (no first-level heading, so its frontmatter title), **Trails and the guide** (its heading's plain text), the long **Part Two** note, and **Appendix**. In **Getting Started**, the link to Trails' **Overview** lands on Trails' own Overview, the one to a heading that does not exist lands at the top of Trails, and the block link lands on the paragraph in Trails that ends with the block.

- [ ] `each` Choose **Save folder as EPUB…** on **Field Guide** again. The footer has **Export…** on the Mac, or **Share…** on a phone or tablet, at the left. Use it: the book goes out of the vault as one EPUB, exactly as **Kitchen Sink** did. Nothing in the vault changed.

---
## Save folder notes as EPUBs

- [ ] `each` Choose **Save folder notes as EPUBs…** on **Field Guide**. The dialog opens titled **Save folder notes as EPUBs** and says **Each note is saved as a separate EPUB; a contents note links to them.** Its button reads **Save 6 EPUBs**. **Save to** shows a new folder, **Field Guide-EPUB**, beside the folder.

- [ ] `once` Open **Save to** and clear **New folder name**. The field shows **Field Guide-EPUB** in gray, and the header still shows the **Field Guide-EPUB** folder beside **Field Guide**, not **Field Guide** itself. Type **Field Guide-EPUB** back.

- [ ] `each` Select **Save 6 EPUBs**. The **Field Guide-EPUB** folder holds one EPUB per note and a contents note listing them in the chosen order. Open the contents note: a notice says **Orbis Reader generates this note. Anything you add here is replaced the next time you convert this folder.**

- [ ] `once` Open the **Getting Started** book and select its link to Trails' **Overview**: the **Trails** book opens at its start — a link between books opens the other book, not a place in it. Select the link back to the guide in the **Part Two** book: the **Getting Started** book opens.

- [ ] `once` Mark a passage in the **Tools** book. Choose **Save folder notes as EPUBs…** on **Field Guide** again and select **Save 6 EPUBs**. Nothing asks, and a notice says **Every EPUB in** the **Field Guide-EPUB** folder **is already up to date.**

- [ ] `once` Add a sentence to **004-Tools** and to **010-Appendix**, and save the set again. It asks **Replace these EPUBs?**: **1 of the previously generated EPUBs has annotations, and its source changed after generation. Annotations are kept, however they may be in the wrong place when it is regenerated.** Appendix, changed but with no annotations, is not counted. Select **Replace**: the notice says **Saved 2 of 6 EPUBs** to the folder, and the rest were already up to date. Remove both sentences.

- [ ] `once` The **Save folder notes as EPUBs…** dialog has no **Export…** or **Share…** button: it makes several books and a contents note, which stay in the vault together.

---
## Read in Orbis Reader

- [ ] `each` Open the context menu on **Clipped Article**. **Read in Orbis Reader** is offered, with no `…`, since it asks nothing. Choose it. `Clipped Article.epub` is written beside the note and opens. Its contents list four chapters: the opening, named after the book, then **Section One**, **Section Two** and **Section Three**.

- [ ] `each` Close the book and choose **Read in Orbis Reader** on **Clipped Article** again. The same book opens, at the page you left, and no new file is written.

- [ ] `once` Add a property to **Clipped Article**'s frontmatter, such as `rating: 3`, and choose **Read in Orbis Reader**. The same book opens: only the text below the frontmatter counts as a change.

- [ ] `once` Add a sentence to the note's text, with the book holding no marks, and choose **Read in Orbis Reader**. The book is rebuilt with the sentence, and opens. Still one file.

- [ ] `each` Mark a passage in the book. Add another sentence to the note and choose **Read in Orbis Reader**. It asks: **This note changed after the book was created**, then **Open an existing annotated version:** with **Version 1** — the date and **1 annotation** — and **Open** beside it, then **A new version of the book will have the note's current text but none of the annotations.**, **Create a new version**, and **Existing versions are kept either way.**

- [ ] `each` Select **Open** beside **Version 1**: the annotated book opens with its passage selection, without the new sentence. Choose **Read in Orbis Reader** again and select **Create a new version**: `Clipped Article - v002.epub` is written beside the first, and opens with the new sentence and no passage selection. `Clipped Article.epub` is still there, with its passage selection.

- [ ] `once` Choose **Read in Orbis Reader** on the long **Part Two** note in **Field Guide**. The book is written beside the note with its name shortened to 80 characters, and opens.

- [ ] `once` In **Settings → Orbis Reader → Reading behavior → Read in Orbis Reader**, turn on **Change how the book opens when using Read in Orbis Reader** and set **How the book opens** to **Focus mode**. Choose **Read in Orbis Reader** on **Clipped Article**: the book opens in Focus mode.

- [ ] `phone` Choose **Read in Orbis Reader** on **Clipped Article** from the **Files** pane, so the book opens in Focus mode as the pane closes. Exit Focus mode: the book and Obsidian's toolbar fill the screen, with nothing slid to one side. Turn the setting off.

- [ ] `once` With the Library on, open `Clipped Article.epub`'s title note. **Type** is `obsidian-note`. **Source** links back to the note, and **Open source** goes to the address in the note's `source` property.

- [ ] `once` In **Settings → Orbis Reader → Reading behavior → Read in Orbis Reader**, clear **Type**: the field shows `obsidian-note` in gray. Add a sentence to **Clipped Article** and choose **Read in Orbis Reader**: the book is rebuilt, and its title note's **Type** is still `obsidian-note`, not `book`. Remove the sentence and set **Type** back to `obsidian-note`.

---
## Clean up

- [ ] `once` Delete what this run wrote: `Kitchen Sink.epub`, `Field Guide.epub`, the **Field Guide-EPUB** folder, `Clipped Article.epub`, `Clipped Article - v002.epub`, the long **Part Two** note's EPUB, their files in `!orbis-data`, and any Library title notes made for them. Undo the edits to **Clipped Article**. Put the **Save as EPUB** settings back as you wrote them down.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
