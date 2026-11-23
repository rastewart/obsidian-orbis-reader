# Test plan — Conversions

← [Design Docs](../README.md)

Turning the book itself into something else: **Save as Markdown**, the book's text as notes in your vault, and **Save as PDF**, the book as a PDF with your marks drawn where you made them. What a user sees is in the guides: [Save as Markdown](../../guide/save-as-markdown.md), [Save as PDF](../../guide/save-as-pdf.md) and [Exporting and Converting with Orbis Reader](../../guide/exporting-and-converting.md).

**Not here:** your marks and notes on their own ([Generate notes](../../guide/generate-notes.md) and [Save annotations as PDF](../../guide/save-annotations-as-pdf.md), on [Annotation exports](annotation-exports.md)), and notes turned into a book ([Notes to EPUB](../../guide/notes-to-epub.md)). Each belongs to its own page.

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

- [ ] `once` In **Settings → Orbis Reader → Conversions → Save as Markdown**, write down what **Default folder for Markdown files**, **Markdown folder path**, **Default format**, **Include images** and **Link format** say, so Clean up can put them back. Set **Default folder for Markdown files** to **Same folder as the book**, **Default format** to **Book folder**, turn **Include images** on and set **Link format** to **Wikilink**.

- [ ] `once` In **Settings → Orbis Reader → Conversions → Save as PDF**, write down the same for its rows, then set **Default folder for PDF files** to **Same folder as the book** and turn on **Include marks and notes** and **Cover sheet**.

- [ ] `once` Open `parts-and-chapters.epub`. Delete `fixtures/!orbis-data/parts-and-chapters.epub.orbis` first if an earlier run left marks in it. Mark these: in **PART I → CHAPTER II**, a passage **Key point**; in **PART II → CHAPTER I**, a passage **Quote** and a note reading **check this**, with no mark. That is two chapters with marks.

- [ ] `once` Delete anything an earlier run wrote beside the book, in `fixtures/`: a `Parts and Chapters` folder or `Parts and Chapters.md` note, any numbered copies of them, and `Parts and Chapters.pdf`. A run from before Save as Markdown saved beside the book may have left the folder or note at the vault root too.

---
## Save as Markdown: the dialog

- [ ] `each` Open the book's **⋯** menu and choose **Save as Markdown…**. The dialog opens titled **Save as Markdown**, with **Format** on **Book folder**, as the setting says. **Save as Markdown…** in the command palette opens the same dialog.

- [ ] `each` The **Save to** fold's header shows the folder the export will write, beside the book from **Same folder as the book**, ending in `Parts and Chapters/` — a folder, so it ends in a slash. Choose **Single Obsidian note**: the header now ends in `Parts and Chapters.md`, and inside the fold the name field's label changes from **Book folder** to **File name**. Choose **Book folder** again.

- [ ] `each` Open **Save to** and change the name to **Parts: test?**. The header shows **Parts test**, with the colon and question mark turned into spaces. Change it back to **Parts and Chapters**.

- [ ] `each` Clear the name. The field shows **Parts and Chapters** in gray, and the header still ends in `Parts and Chapters/`. Choose **Single Obsidian note**: the field is still empty, and the header ends in `Parts and Chapters.md`. Choose **Book folder** again and type **Parts and Chapters** back.

- [ ] `each` **Include images** is ticked, as the setting says, and says **Saves images to an assets/ folder inside the book folder.** Choose **Single Obsidian note**: it says **Saves images beside the note, in a matching "-assets" folder.** instead. Choose **Book folder** again.

- [ ] `once` Turn **Include images** off in **Settings → Orbis Reader → Conversions → Save as Markdown**, and open **Save as Markdown…** again: **Include images** is unticked. Turn the setting back on.

- [ ] `each` The **Chapters** list shows every row ticked, and its header reads **Chapters · N of N**. The first row is **Cover**, marked **not in contents**, since the book's contents never lists it. Then the title page, **PARTS AND CHAPTERS**, the preface, and every chapter named with its part — **PART I – CHAPTER I**, **PART II – CHAPTER I** — since every part has a **CHAPTER I**. **PART I – CHAPTER VI** is named with its part too, though no other part has a sixth chapter. **EPILOGUE** is one row, holding its two sections.

- [ ] `each` Untick **PART I – CHAPTER I**: the header counts one fewer. Select **Clear**: every row is unticked, the header reads **0 of N**, and **Save** is unavailable. Select **Invert**: every row is ticked again. Untick one and select **Select all**: all are ticked.

- [ ] `phone` The dialog fills the screen. Scroll the **Chapters** list to its end: **Cancel** and **Save** stay at the bottom the whole time.

---
## Save as Markdown: a book folder

- [ ] `each` Select **Save**. The dialog reports each stage as it goes — **Extracting section…**, **Writing N of M: …** for each chapter, **Writing table of contents…** — then closes, saying **Saved to Parts and Chapters/**.

- [ ] `once` The folder holds a contents note, `000 - Parts and Chapters.md`, a numbered note per row, such as `001 - Cover.md`, and an `assets` folder with the book's images. The contents note shows the cover and links to every chapter note, in order. Select one link: its chapter note opens.

- [ ] `once` Open the **PART II – CHAPTER I** note. Its frontmatter reads `title: "Parts and Chapters: PART II – CHAPTER I"`, `chapter: "PART II – CHAPTER I"`, `book` as a link to the book file and `book_title: "Parts and Chapters"`. Select the `book` link: the book opens.

- [ ] `once` In **PART II – CHAPTER II**, the frontmatter's `prev` links to the **PART II – CHAPTER I** note and `next` to **PART II – CHAPTER III**, each written `"[[NNN - …]]"`, and `toc` links to `000 - Parts and Chapters`. Select `next`: that note opens. **PART II – CHAPTER I**'s `prev` goes to the last chapter of **PART I**, `009 - PART I – CHAPTER VI`, not to **PART II**, which is a heading and not a note. In the first chapter note `prev` is empty, and in the last, **ABOUT THIS EDITION**, `next` is empty.

- [ ] `once` A contents entry that holds only its title is a heading in the contents note, not a note of its own: **PART II** to **PART VI** are headings with their chapters' links beneath them, and so is the title, **PARTS AND CHAPTERS**. **EPILOGUE** is a heading too, over **EPILOGUE – I** and **EPILOGUE – II**, which are notes. No note holds anything of yours: no mark, no **check this**.

---
## Save as Markdown: a single note, and existing files

- [ ] `each` Open **Save as Markdown…** with **Book folder** still chosen and the same name. Below the list it says **Folder already exists**, offering **Save as new version** (*Creates a new numbered folder alongside the existing one.*), already chosen, and **Replace** (*Writes into the existing folder, overwriting any existing chapter files.*). Select **Save**: a second folder, `Parts and Chapters-1`, is written, and the first is left as it was.

- [ ] `once` Generate again with **Replace**: the first folder is written over, and no new folder appears.

- [ ] `each` Choose **Single Obsidian note**, untick every **PART III** chapter, and save. One note, `Parts and Chapters.md`, is written, with its images in a `-assets` folder beside it. Its `title` is the book's name, and it has a heading per chapter you left ticked and none for **PART III**.

- [ ] `once` Save the single note again under the name **No Images**, with **Include images** unticked in the dialog. No `No Images-assets` folder is written, and the note has no `![[` image embed anywhere. Save a **Book folder** named **No Images** the same way: it has no `assets` folder, and no note in it embeds an image.

- [ ] `once` Save the single note again with the same name: it says **File already exists**, with **Save as new version** (*Creates a new numbered file alongside the existing one.*) and **Replace** (*Overwrites the existing file.*). There is no **Merge**, since this note holds nothing of yours.

- [ ] `desktop` In **Save as Markdown…**, choose **Single Obsidian note**. The footer has **Export…** at the left, apart from **Cancel** and **Save**. Choose **Book folder**: **Export…** goes, and the chapter ticks are as they were. Choose **Single Obsidian note** again, and select **Export…**: the system save dialog opens with **Parts and Chapters.md**. Cancel it: the dialog is back as you left it.

- [ ] `desktop` Select **Export…** with **Include images** ticked, pick a folder outside the vault, and save. The notice gives the whole path, and nothing new is in the vault. Open the note in another Markdown editor. It has no `[[` anywhere and no image. The contents page's links are written `[text](#anchor)`, the anchor in lowercase with hyphens for spaces, and in that editor they go to their chapters. The `book` property reads `parts-and-chapters.epub`, as text.

- [ ] `mobile` In **Save as Markdown…**, choose **Single Obsidian note**. The footer has **Share…** at the left and **Cancel** and **Save** at the right, all on one line. Choose **Book folder**: **Share…** goes. Choose **Single Obsidian note** again and select **Share…**: after the progress lines, the share sheet opens and the dialog closes. Send the note to another app: it arrives. Nothing in the vault changed.

- [ ] `android` In that share list, only a few apps open a Markdown file, and **Android Share** opens the full list of apps to send it to.

---
## Save as Markdown: links, notes and hard books

- [ ] `once` Set **Link format** to **Standard Markdown** in settings, then save `parts-and-chapters.epub` as a single note under a new name. Its images are written `![](…)` rather than `![[…]]`, with the spaces in the path written `%20`, and the cover shows at the top of the note. Set **Link format** back to **Wikilink**.

- [ ] `once` Open `technical-book.epub` and choose **Save as Markdown…**. Each numbered chapter has a row, followed by a row for each of its sections, since each section is a file of its own: **1. First Steps**, then **Why Channels** and **Installing**. The sections the contents never lists are rows too, named with the chapter they sit in: **1. First Steps – Summary** to **4. Running a Server – Summary**, **2. Core Concepts – Troubleshooting** and **5. Advanced Topics – Troubleshooting**. Save it as a **Book folder**: there is one note per row, in the same order.

- [ ] `once` In that folder, **2. Core Concepts** holds the copyright line, then the chapter's opening text, with no second **2. Core Concepts** heading. In **Frontmatter**, the printed contents page's links open their notes. In **Why Channels**, the link to `https://example.com/docs` is still a web link. In **Records and Fields**, Table 2-1 is a table, with **Field** and **Meaning** as its header row. In **Interactive Editing**, the lines of code are paragraphs, since the book writes them as paragraphs, so the spacing between the columns in the last two lines is gone; the one showing `<script type="text/javascript">` reads as text, and every heading after it is still listed in the **Outline** pane.

- [ ] `once` Open `endnotes.epub` and save it as a **Book folder**. Each chapter note ends with its footnotes, written `[^1]: …`; a paragraph citing one ends in a block ID such as `^fn-1`, hidden in Reading view; and the **Notes** note is still there, with each number a link back to the paragraph citing it. Select a footnote number in Reading view: it jumps to the note, and **↩** comes back.

- [ ] `once` Save `endnotes.epub` again as a **Single Obsidian note**. Chapters that each number their notes from 1 no longer repeat a label: the second chapter's first note is `[^1-2]`.

- [ ] `once` Open `footnotes.epub`, whose notes sit at the end of each chapter, and save it as a **Book folder**. Each chapter note ends with the notes it cites, written `[^1]: …`: **Chapter One** with *Note 1-1* and *Note 1-2*, **Chapter Two** with *Note 2-1*, its web link still a link. The notes are gone from the end of the chapters' text, and no paragraph ends in a block ID such as `^fn-1`.

- [ ] `once` Open `fb2-notes.fb2`, which keeps its notes in a separate notes section, and save it as a **Book folder**. **Chapter One** ends with `[^1]: Note 1, cited from Chapter One and again from Chapter Three.`, then `[^2]` and `[^3]`. **Chapter Two** ends with `[^4]`, its second paragraph, *Note 4, second paragraph*, indented under it. No footnote opens with a heading such as `# 1`.

- [ ] `once` Open `gutenberg-style.epub`, a book laid out the way Project Gutenberg lays one out, and choose **Save as Markdown…**. No row is named after a file, such as `wrap0000` or a name ending in `.htm`: the first row is **Cover** and the last is **linked image**, each named from its own page and marked **not in contents**. While a row's name is still being read, it reads **Section N** and then changes in place.

- [ ] `once` Save it as a **Book folder**. The book has two places where a file break cuts across the text, and each part of the text should be in the note it belongs to. **CHAPTER III** is a note of its own, after **CHAPTER II**, starting *This is CHAPTER III, whose heading ended the previous file* — that text is at the top of the next file in the book. No note is called **PART II**; it is a heading in the contents note. There is one **THE FULL PLACEHOLDER PRESS LICENSE** note, starting with the *END OF THE PLACEHOLDER EBOOK* lines.

- [ ] `once` In the same folder: **The Placeholder Press eBook of Gutenberg Style** is a note of its own, named by its own heading. **PART I – CHAPTER I** contains *This file continues CHAPTER I*, which the book keeps in a file of its own. **CHAPTER II**, after **PART II – CHAPTER I**, keeps its plain name, since the book's contents skip it. Each reading day, such as **[p11] First Day. Contents**, is a heading in the contents note above its reading's note, as the book's own contents name it.

- [ ] `once` Open `omnibus.epub` and choose **Save as Markdown…**. Each novel opens into its chapters — **Novel One – Chapter 01** onward — and no row is a file that opens with *This file continues*. Save it as a **Book folder**: that sentence opens the text right after the chapter it names, inside that chapter's note. In the contents note, **NOTES** — a page the book's contents don't list, holding only that word — is a bold line in the list, not a heading over the novels after it.

- [ ] `once` Open `calibre-body-anchors.epub`, made the way Calibre makes books, with every contents entry pointing at the start of a file rather than at a heading, and save it as a **Single Obsidian note**. No error notice appears, and the note has a heading per chapter, each chapter named with its part — `# Prologue`, `# Part One – Chapter 1` to `# Part Two – Chapter 5` and `# Epilogue` — each over its text. Under `# Part One – Chapter 3` the text runs straight on into *This file is the second half of Chapter 3, split the way Calibre splits*, with no heading between, though that file carries Chapter 3's title. Under `# Part Two – Chapter 4` the text runs straight on into *This file continues Chapter 4: no id, no heading, and no contents entry of its own.*, with no heading between, and `# Part Two – Chapter 5` follows. Under `# Contents`, select **Chapter 4**: the note goes to `# Part Two – Chapter 4`.

- [ ] `once` Open `parts-and-chapters.azw3` and choose **Save as Markdown…**. The **Chapters** list is the one `parts-and-chapters.epub` lists, under the same names, from **PARTS AND CHAPTERS** and **A NOTE ON THE TEXT** to **ABOUT THIS EDITION** — not one row per file named by its heading — plus one row at the end, **Table of Contents**, marked **not in contents**: the printed contents page the AZW3 keeps as a page of its own, which the EPUB does not. So the header counts one more than the EPUB's. Save it as a **Book folder**: **A NOTE ON THE TEXT** is a note of its own holding the note's text, and the **PARTS AND CHAPTERS** note does not hold it.

- [ ] `once` In the `parts-and-chapters.azw3` book folder, the first note is **Cover**, holding the cover picture, as the EPUB's folder does, and the picture is in its `assets` folder.

- [ ] `once` Open `technical-book.azw3` and save it as a **Book folder**. **Why Channels** shows the diagram between *The layout is shown below.* and *Figure 1-1.*, as the EPUB's folder does, and **Cover** holds the cover picture. Choose **Save as PDF…** and save: the diagram prints in **Why Channels**.

- [ ] `once` Open `annotation-workhorse.mobi` and choose **Save as Markdown…**. Each row is an entry of the Navigator's **Contents** tab, by its name, though the book keeps its chapters in a few long files. Save it as a **Book folder**: each note holds its own chapter's text, and no chapter's text is in the note before it. The book's one picture, its cover, is in the folder's `assets` folder, and the note holding it is named **Cover** — the cover page has no heading or title of its own.
---
## Save as PDF: the dialog

- [ ] `each` In `parts-and-chapters.epub`, open the **⋯** menu and choose **Save as PDF…**. The dialog opens titled **Save as PDF**. The line at the top reads **The book, with your marks and notes**. **Save as PDF…** in the command palette opens the same dialog.

- [ ] `each` The **Save to** fold's header shows a path beside the book, ending in `Parts and Chapters.pdf`, from **Same folder as the book**. Open it and change the name to **Parts: test?**: the header shows **Parts test.pdf**. Change it back to **Parts and Chapters**.

- [ ] `each` The **Chapters** fold's header reads **N of N**. Open it: the dropdown says **All N chapters**, and each row shows how many marks it holds — **1 mark** for **PART I – CHAPTER II**, **2 marks** for **PART II – CHAPTER I** — or **no marks**. Choose **Only the 2 with marks**: only those two stay ticked, and the line at the top reads **2 of N chapters, with your marks and notes**.

- [ ] `each` Tick one more chapter by hand: the dropdown says **3 selected below**, and the **Chapters** fold's header **3 of N**. Select **Clear**: every row is unticked, the dropdown says **0 selected below**, the line at the top reads **0 of N chapters, with your marks and notes**, **No chapters are selected.** appears at the bottom of the dialog, just above the buttons, and **Save** is unavailable. Choose **All N chapters** in the dropdown again.

- [ ] `each` **Include marks and notes** is on. Turn it off: the line reads **The book, without marks or notes**, and **Cover sheet**, **Marked up by** and **Marks to include** are gone, along with **Only the 2 with marks** in the chapter dropdown. Turn it back on: all of them return as they were.

- [ ] `each` With **Only the 2 with marks** chosen, turn **Include marks and notes** off: the chapters go back to **All N chapters**, since a choice made by marks means nothing without them. Turn it back on.

- [ ] `each` Turn **Cover sheet** off: **Marked up by** is gone, since the cover sheet is the only place this PDF prints it. Turn it back on.

- [ ] `each` Open **Marks to include**: **Passage selections** and **Note selections** are both on, and the marks are listed by name. Turn **Passage selections** off: **Note selections** is now the last one on, so it is dimmed and cannot be pressed, and below the pair it says **At least one of these must stay on.** Turn **Passage selections** back on.

- [ ] `once` Open `First-Open.epub`, which has nothing marked, and choose **Save as PDF…**: it is offered, and the line reads **The book**. There is no **Include marks and notes**, **Cover sheet**, **Marked up by** or **Marks to include**, since there are no marks for them to decide.

- [ ] `once` Turn **Include marks and notes** off in **Settings → Orbis Reader → Conversions → Save as PDF**: the **Cover sheet** row disappears from the page. Open **Save as PDF…** in `parts-and-chapters.epub`: it opens with the marks off. Turn the setting back on.

- [ ] `once` Open `parts-and-chapters.azw3`, choose **Save as PDF…** and open **Chapters**. The rows are the ones **Save as Markdown…** lists for this book, from **PARTS AND CHAPTERS** to **Table of Contents**. Save it: in the PDF, **A NOTE ON THE TEXT** is a heading of its own, over the note's text, after the title page's, and the cover picture is printed at the start of the book.

- [ ] `once` Open `omnibus.epub`, choose **Save as PDF…** and open **Chapters**. The rows are the ones **Save as Markdown…** lists for this book, in the same order and under the same names, from **Novel One – Chapter 01** on, and there is no row for a file that opens *This file continues*.

---
## Save as PDF: the file

- [ ] `each` In `parts-and-chapters.epub`, with **All N chapters**, the marks on and the cover sheet on, select **Save**. It says **Preparing the PDF…**, then **Reading N of M…**, **Drawing N of M…** and **Saving the file…**, closes, and says **Saved Parts and Chapters.pdf**. The file is beside the book.

- [ ] `once` Open the PDF. The first page is the cover sheet: the title, the author, who marked it if **Marked up by** has a name, the date, and a legend of the marks used, each by its name and color, never an emoji. The PDF's sidebar has an outline of the book's headings, and selecting one goes to it.

- [ ] `once` In **PART I → CHAPTER II** the **Key point** passage is drawn as it is in the reader, and in **PART II → CHAPTER I** so is the **Quote** passage. The **check this** note is a comment at its place, which the viewer's comment pane lists.

- [ ] `once` Save again with the same name. It asks **Overwrite PDF?**, with **Replace** and **Cancel**. Select **Cancel**: the dialog is still open, as you left it. Save and select **Replace**: the file is written over.

- [ ] `desktop` Open **Save as PDF…** again. The footer has **Export…** at the left, apart from **Cancel** and **Save**. Select **Export…**: the system save dialog opens with the name from **File name**, and the status line under the folds says nothing. Cancel it: the dialog is back as you left it, with the keyboard on **Export…**.

- [ ] `desktop` Select **Export…**, select a folder outside the vault, and save. It says **Preparing the PDF…**, writes the file there, closes, and the notice gives the whole path. Open the PDF: it is the same PDF that **Save** writes. Nothing new is in the vault.

- [ ] `mobile` Open **Save as PDF…** again. The footer has **Share…** at the left and **Cancel** and **Save** at the right, all on one line. Select **Share…**: after **Preparing the PDF…** the share sheet opens and the dialog closes. Send the PDF to another app, such as a messaging app: it arrives, and it opens. Nothing new is in the vault.

- [ ] `android` In that share list, the apps that open a PDF come first, and **Android Share** opens the full list of apps to send it to.

- [ ] `each` Open `fixtures/notes-to-epub/Kitchen Sink.epub` — if it is not there, make it with **Save note as EPUB…** on the **Kitchen Sink** note — and save it as a PDF. In **Text and emphasis**, the line starting **Emoji** prints 😀 👍🏽 👨‍👩‍👧 🇯🇵 1️⃣ ©️ in color, one picture each, level with the text. With the expanded character set downloaded, the **♥** after them is plain black text, since that font has it; without it, the ♥ is a picture too. Copy the line from the PDF viewer: pasted, it reads the same, emoji included. Each footnote, where the book lists them, ends in a **↩** back-link drawn as ordinary text, not a gap.

- [ ] `once` Turn **Include marks and notes** off and save under a new name. The PDF has no cover sheet, no marks and no comments: a clean copy of the book.

- [ ] `once` Open `technical-book.epub` and save it as a PDF. Open the PDF and use its outline in the sidebar to go to each of these. **Frontmatter**: the book's printed contents page, its entries in blue; select **Installing**, and the PDF goes to that section.

- [ ] `once` **Why Channels**: the text is ordinary paragraphs, though the book writes every one as a `<div>`. In the gray **Note** box, select the link `https://example.com/docs`: your browser opens it.

- [ ] `once` **Records and Fields**: the caption reads **Table 2-1.** above **Record fields**, and the table below it is ruled, with **Field** and **Meaning** as its header row.

- [ ] `once` **Plumbing**: the block starting `channel plumb --dry-run` keeps its indentation, its last line indented twice. Below it, the path starting `/srv/channel/configuration/` breaks onto a second line rather than running off the right edge of the page. Select **Figure 1-1** in the next sentence: the PDF goes back to the figure in **Why Channels**.

- [ ] `once` Open `gutenberg-style.epub` and save it as a PDF. The image the book centers is centered, and the one it sets left is flush left. The small plate in **CHAPTER I** is a link, as it is in the book: select the picture, and the PDF goes to the full-size plate at the very end. Select the **back** link under it, and the PDF returns to the small plate.

- [ ] `once` Open **Settings → Orbis Reader → Conversions → Save as PDF**. **Expanded character set** says whether it is downloaded, with **Download** or **Remove** beside it. This is the only place to remove it. If it is downloaded, select **Remove**: it says **Not downloaded…**, and **Save as PDF…** offers **Download the expanded character set** again. Download it from either place to put it back.

---
## Clean up

- [ ] `once` Delete the folders, notes and PDFs this run wrote beside each book used, and anything saved with **Export…** outside the vault. Put the **Save as Markdown** and **Save as PDF** settings back as you wrote them down. Delete `parts-and-chapters.epub.orbis` if the next run should start clean.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
