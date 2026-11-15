# Test plan — Annotation exports

← [Design Docs](../README.md)

Getting your marks, notes and bookmarks out of a book: **Generate notes**, with its notes styles, its two formats and what happens when the notes already exist, and **Save annotations as PDF**, the digest you send. What a user sees is in the guides: [Generate notes](../../guide/generate-notes.md), [Save annotations as PDF](../../guide/save-annotations-as-pdf.md) and [Exporting and Converting with Orbis Reader](../../guide/exporting-and-converting.md).

**Not here:** the book itself as Markdown or PDF ([Save as Markdown](../../guide/save-as-markdown.md) and [Save as PDF](../../guide/save-as-pdf.md)), and a note per annotation kept up to date as you read ([Reading records](../../guide/reading-records.md)). Each belongs to its own page.

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

- [ ] `once` Open `parts-and-chapters.epub`. Delete `fixtures/!orbis-data/parts-and-chapters.epub.orbis` first if an earlier run left marks in it. Every part has a **CHAPTER I**, so a chapter's name only means something with its part beside it. In the **Marks manager**, the book uses **Orbis marks**, so every mark below has that preset's badge.

- [ ] `once` Mark these, in this order: in **PART I → CHAPTER II**, a passage **Key point** and a passage **Quote**; in **PART II → CHAPTER I**, a passage **Key point** and a note reading **check this**, with no mark; in **PART III → CHAPTER IV**, a note marked **Question**. Add a bookmark in **PART II → CHAPTER III**. That is four chapters with something in them, and one with only a bookmark.

- [ ] `once` In **Settings → Orbis Reader → Annotations → Notes styles**, select **+** and name a new style **Test notes**. A new style starts from the shipped settings — its folder, file names, frontmatter and line templates, with every content type on — which the steps below expect, whatever your own styles have been changed to. Your default style is left as it is.

- [ ] `once` Under each template field on that style's page — the file name, the frontmatter and each content type's line — a line begins **Placeholders:**, the same label on every one, and lists the placeholders as buttons. Select one: it is inserted into the field at the insertion point. Delete what you inserted.

- [ ] `once` Clear **File name template**: the field shows `{{title}} Notes` in gray. Select **Reset** beside it: the field holds `{{title}} Notes` again.

- [ ] `once` Delete any notes, folders or PDFs an earlier run wrote for this book — `Parts and Chapters Notes.md`, a `Parts and Chapters Notes` folder, and any numbered copies of them.

---
## Generate notes

- [ ] `each` Open the book's **⋯** menu and choose **Generate notes…**. The dialog opens titled **Generate notes**, on **Notes style** showing your default style marked **(default)**. **Generate notes…** in the command palette opens the same dialog. Choose **Test notes** under **Notes style**: **Format** is **Single Obsidian note**. Every run below uses **Test notes**.

- [ ] `each` The **Save to** fold's header shows the path the note will take, folder and file name together, ending in `Parts and Chapters Notes.md`. Open it, and change the file name to **Parts: test?** — the header shows **Parts test** with the colon and question mark turned into spaces. Change the name back to **Parts and Chapters Notes**: the steps below rely on every run using that name, so a second run finds the first.

- [ ] `each` Clear the file name. The field shows **Parts and Chapters Notes** in gray, the header still ends in `Parts and Chapters Notes.md`, and **Save** can still be selected. Open **Note content** and turn **Bookmarks** off and on again: the field is still empty, with the name in gray. Choose **Book folder** and clear the folder name: the field shows **Parts and Chapters Notes** in gray, and the header ends in `Parts and Chapters Notes/`. Choose **Single Obsidian note** again: the field shows **Parts and Chapters Notes**.

- [ ] `each` The **Note content** fold's header says what is on. Open it: **Chapter headings**, described *Adds a heading for every chapter, including chapters with no annotations.*, then **Bookmarks**, **Passage selections** and **Notes**, all on. All four count as content, since a note of chapter headings alone is an outline of the book. Turn off **Bookmarks**, **Passage selections** and **Notes**: **Chapter headings** is now the last one on, so its switch is disabled and its row says **At least one content type must stay on.** Turn the three back on.

- [ ] `each` This step tries the chapter picker without generating anything. Open **Chapters**: every chapter of the book is listed, and only the four set up above show a count of saved items — one of them, **PART II → CHAPTER III**, holds only the bookmark. Choose **Only the 4 with content**: only those four stay ticked. Untick one by hand: the fold's header reads **3 selected below**. Select **Clear**: the header reads **0 of N**, and **Save** is grayed out, as is **Export…** (desktop) or **Share…** (mobile) with **Format** on **Single Obsidian note**. Tick a chapter: they come back.

- [ ] `each` Choose **All N chapters** in **Chapters** again, so the runs below take every chapter.

- [ ] `each` Open **Marks to include**: it lists **Key point**, **Quote**, **Question** and **Unmarked notes**, each with how many carry it. Choose **Key point** only: the header reads **Key point**.

- [ ] `each` In **Note content**, turn off **Passage selections** and **Notes**, leaving **Bookmarks** on. **Marks to include** dims and says **Select passage selections or notes above to filter them by mark.** Turn both back on.

- [ ] `each` Generate with **Key point** chosen and all four content types on. One note is written and opened: frontmatter, the book's title as the heading, then the sections in the style's order under chapter headings such as **PART I – CHAPTER II**. It holds the two **Key point** passages, under **Passage selections**, and the bookmark, under **Bookmarks**, and nothing marked **Quote** or **Question**: a bookmark carries no mark, so it is always kept. With **Chapter headings** on and every chapter chosen, every chapter has its heading, the ones with nothing in them too.

- [ ] `once` In that note, each passage line starts with its mark's badge and name — `🔑 Key point: ` — and has a link back to its place in the book. In the unfiltered runs below, a **Quote** line starts `💬 Quote: ` and the **Question** note `❓ Question: `, and the unmarked note's line has no badge and no mark name, since it has no mark. Select a link: the book opens at the passage.

- [ ] `once` The frontmatter has `title: "Parts and Chapters Notes"` and `book_title: "Parts and Chapters"`, and every value is valid YAML.

---
## Book folder

- [ ] `each` Generate again with **Format** set to **Book folder** and **Marks to include** back to **All marks**. A folder is written with a contents note, `000 - Parts and Chapters.md`, and one note for every chapter in the **Chapters** list — the ones with nothing in them too, such as **012 - PART II**, since **All chapters** is chosen. A notice says *Wrote N chapter notes and the contents note.*, N being the number in the dialog's **All N chapters**.

- [ ] `once` A chapter note's `title` reads **Parts and Chapters: PART II – CHAPTER I Notes**, and its frontmatter carries `chapter`, `book`, `book_title`, `has_bookmarks`, `has_passage_selections`, `has_notes`, `prev` and `next`. Its links to the previous and next chapter notes go to them.

- [ ] `once` The contents note shows an Obsidian base listing every chapter note in the set, in chapter order, with the columns **#**, **Chapter**, **Bookmarks**, **Passage selections** and **Notes**.

- [ ] `once` **Chapter headings** is not offered in **Note content** for a book folder, since each chapter is already its own note. Turn off **Bookmarks**, **Passage selections** and **Notes**: none of them locks, **Save** stays enabled, and the **Chapters** dropdown offers only **All N chapters** and the hand-picked list. Generate into a new folder: it holds the contents note and one note for every chapter, each with its heading and **Open in book** link and nothing else. Turn the three back on.

- [ ] `once` In **Settings → Orbis Reader → Annotations → Notes styles**, set a style's **Save as** to **Book folder** and turn off all three types: none of them locks, and the **Include chapters without annotations** row goes. Generate notes with that style: the folder has a note for every chapter, each with its heading and its link into the book. Turn a type back on: the row returns. Set **Save as** to **Single Obsidian note**: the last type that is on locks again, with **At least one content type must stay on.**

---
## When the notes already exist

- [ ] `each` With **Format** back on **Single Obsidian note**, mark one more passage in **PART I → CHAPTER II** and generate again with the same name. It says **File already exists**, offering **Merge** (*Review what's changed and merge into your existing notes.*), **Save as new version** (*Creates a new numbered file alongside the existing one.*) and **Replace** (*Rewrites the entire file.*). **Merge** is the default.

- [ ] `each` Choose **Merge**. The merge dialog shows the existing note against the new one, a change at a time, with **Change 1 of N**. For each change choose **Keep original** or **Use new version**, then **Apply**: it says **Merge applied.**, and the note holds what you chose.

- [ ] `once` Generate again and choose **Save as new version**: a second, numbered note is written beside the first, which is left as it was. Generate again and choose **Replace**: the note is rewritten without a review.

- [ ] `once` As a **Book folder**, mark a passage in a new chapter and change one in an old one, then generate again and choose **Merge**. The chapter list shows the new chapter added, unchanged chapters up to date, and the changed one with **Review**. Review it, then finish: **Merge complete.**

- [ ] `once` In that book folder, create a note of your own, and save the book there with **Save as Markdown** as chapter notes. Pick fewer chapters in **Chapters**, then generate notes again and choose **Replace**: the option reads *Removes this book's earlier chapter notes from the folder and writes new ones.*, and the confirmation *This book's earlier chapter notes in the folder will be replaced. Any edits you made to them will be lost.* After **Replace**, the folder holds the new chapter notes, the contents note, your own note and the Save as Markdown notes; the chapters you left out are in the trash, and the notice adds *Removed N earlier chapter notes.* The contents note's table lists the new chapter notes once each, and not the contents note itself.

- [ ] `once` Start a single-note **Merge** and close the merge dialog before **Apply**. Generate again: it says **A merge is already in progress.**, with **Resume merge** and **Discard draft**. **Resume merge** reopens the review where it was left. Generate once more and choose **Discard draft**: the draft goes, and you are offered the three choices again.

---
## Open notes

- [ ] `once` From the **⋯** menu, choose **Open notes**. With both a single note and a book folder generated, a list offers both: the folder's note for the chapter you are reading first, then the single note. Choose one: it opens.

- [ ] `once` Delete every notes file and folder this run generated, and choose **Open notes** again: the **Generate notes** dialog opens, since there is nothing to open.

- [ ] `desktop` Open **Generate notes…** with **Format** on **Single Obsidian note**. The footer has **Export…** at the left, apart from **Cancel** and **Save**. Choose **Book folder**: **Export…** goes. Choose **Single Obsidian note** again and select **Export…**: the system save dialog opens with the note's file name. Cancel it: the dialog is back as you left it.

- [ ] `desktop` Select **Export…**, pick a folder outside the vault, and save. Nothing asks about a note that already exists, the notice gives the whole path, and nothing new is in the vault. Open the note in another Markdown editor. It has no `[[` and no `obsidian://` anywhere, and no **↗ Open in book** line. Each passage ends in its location as text, such as `loc. 42`. The **Contents** entries are written `[Chapter](#anchor)` and go to their chapters. The properties are there, and `book` reads `parts-and-chapters.epub`, as text. The **check this** note's text reads as you typed it.

- [ ] `mobile` Open **Generate notes…** with **Format** on **Single Obsidian note**. The footer has **Share…** at the left and **Cancel** and **Save** at the right, all on one line. Choose **Book folder**: **Share…** goes. Choose **Single Obsidian note** again and select **Share…**: the share sheet opens and the dialog closes. Send the note to another app: it arrives. Nothing in the vault changed.

---
## Save annotations as PDF

- [ ] `once` Open `First-Open.epub`, which has nothing marked. In the **⋯** menu, **Save annotations as PDF…** is grayed out, and the command palette does not list it. Add a bookmark: still unavailable, since a digest holds passages and notes. Remove the bookmark.

- [ ] `each` Back in `parts-and-chapters.epub`, choose **Save annotations as PDF…**. The line at the top says **N marks and notes across M chapters**, counting your passages and notes only: **PART II → CHAPTER III**, which holds only the bookmark, is not among the chapters.

- [ ] `each` **Chapters with marks and notes** lists only the chapters holding passages or notes, each with its count. Untick one: the line at the top follows, and the unticked row still shows its count.

- [ ] `each` Under **Marks to include**, **Passage selections** and **Note selections** are both on. Turn **Passage selections** off: **Note selections** is now the last one on, so it is dimmed and cannot be pressed, and below the pair it says **At least one of these must stay on.** Turn **Passage selections** back on: the lock and the line go.

- [ ] `each` Choose only **Question** among the marks: the chapter list shrinks to the one chapter with a **Question** note, and the line at the top follows. Choose **All marks** again.

- [ ] `once` In **Settings → Orbis Reader → Annotations → Save annotations as PDF**, type your name in **Marked up by**. Open **Settings → Orbis Reader → Conversions → Save as PDF**: the same name is there, since one setting serves both PDFs.

- [ ] `once` Choose **Save annotations as PDF…** again: **Marked up by** shows your name. Change it to another name: the fold's header follows. A name typed here is for this PDF only — the PDF below carries it, and **Marked up by** in settings still has yours.

- [ ] `each` Open the **Save to** fold: it shows the path, and a default folder from **Settings → Orbis Reader → Annotations → Save annotations as PDF**. Select **Save**: it says **Preparing the PDF…**, then writes the file.

- [ ] `once` Choose **Save annotations as PDF…** again, open **Save to** and clear **File name**. The field shows the name it opened with in gray, and the header keeps the same path. Cancel.

- [ ] `once` Open the PDF. The title, the author, who marked it — the name typed in the dialog — and the date, then a legend saying what each mark means, then each chapter with your passages, each wearing its mark, your notes in italics below them, and the mark's name and location in small type. The mark is shown by its name and color, never an emoji.

- [ ] `each` Add a note reading **Great point 👍🏽 🇯🇵** to a passage, and save the PDF. The note prints both emoji in color, as one picture each, the size of the text around them and level with it. Select that line in the PDF viewer and copy it: pasted, it reads **Great point 👍🏽 🇯🇵**. Delete the note.

- [ ] `once` Save again with the same name. It asks before replacing the file. Cancel: the dialog is still open, as you left it.

- [ ] `desktop` Open **Save annotations as PDF…** again. The footer has **Export…** at the left, apart from **Cancel** and **Save**. Select **Export…**: the system save dialog opens with the name from **File name**, and the status line under the folds says nothing. Cancel it: the dialog is back as you left it, with the keyboard on **Export…**.

- [ ] `desktop` Select **Export…**, select a folder outside the vault, and save. It says **Preparing the PDF…**, writes the file there, closes, and the notice gives the whole path. Open the PDF: it is the same PDF that **Save** writes. Nothing new is in the vault.

- [ ] `mobile` Open **Save annotations as PDF…** again. The footer has **Share…** at the left and **Cancel** and **Save** at the right, all on one line. Select **Share…**: after **Preparing the PDF…** the share sheet opens and the dialog closes. Send the PDF to another app, such as a messaging app: it arrives, and it opens. Nothing new is in the vault.

- [ ] `android` In that share list, the apps that open a PDF come first, and **Android Share** opens the full list of apps to send it to.

- [ ] `once` If **Download the expanded character set** is offered, it says a one-time download of about 3.1 MB. Without it, mark a passage holding an arrow or a Greek word — `body-text-styles.epub` has symbol spans — and save: those characters print as **?**. With it downloaded, they print, and the offer is gone.

---
## Clean up

- [ ] `once` Delete the notes, folders and PDFs this run wrote, and delete the **Test notes** style. Delete `parts-and-chapters.epub.orbis` if the next run should start clean, and clear **Marked up by** if it was empty before.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
