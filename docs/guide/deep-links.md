# Deep Links

← [User Guide](README.md)

---

## Overview

A deep link opens a book at a location. You can put a deep link in any Obsidian note, then select it to go to that place in the book.

Orbis Reader makes deep links for you. You can also write one by hand.

---

## Copy a link to the current location

1. In the book, go to the page that you want to link to.
2. Run **Copy link to current location** from the command palette.
3. Paste the link into a note.

The notice *Link copied to clipboard* shows when the link is copied.

For the Markdown link that is copied, see [What a copied link looks like](#what-a-copied-link-looks-like).

---

## Copy a link to a passage

1. Select the passage in the book.
2. On the marks bar, select **Copy link to selection**.
3. Paste the link into a note.

To copy a link to an annotation note, open the note and select **Copy link**.

For the Markdown link that is copied, see [What a copied link looks like](#what-a-copied-link-looks-like).

---

## Open a deep link

Select the link in a note. Orbis Reader opens the book and goes to the location. A link to a passage briefly flashes the passage.

If the book is already open, the link goes to the location in the open pane. It does not open a new pane.

A deep link works anywhere Obsidian shows Markdown, such as a note or a canvas.

For a link to a book that moved, see [If you move or rename a book](#if-you-move-or-rename-a-book).

---

## What a copied link looks like

A copied link is a Markdown link. Its text is the book's file name:

```
[My Book](obsidian://orbis-nav?file=books%2FMy%20Book.epub&cfi=epubcfi(%2F6%2F4!%2F4%2F2%2F1%3A0))
```

You can change the link text. The link still works.

---

## Where Orbis Reader writes deep links

- **Generate notes:** each annotation line links to its passage, and each chapter heading has an **↗ Open in book** link. A chapter note's `open_chapter` property is a deep link to the chapter. See [Generate Notes](generate-notes.md).
- **Reading records:** each record links to its passage. See [Reading Records](reading-records.md).
- **Save folder notes as EPUBs:** a link from one note to another becomes a deep link to the other book. It opens that book at its start. See [Notes to EPUB](notes-to-epub.md).

---

## Linked vault notes

A note that contains a deep link to a book shows in the book's **Linked vault notes** tab. A note that links to the book file also shows there. See [The .orbis File](orbis-file.md).

---

## If you move or rename a book

Obsidian does not update deep links when you move or rename a book. A deep link in your own notes still points to the old path, and selecting it shows *Book not found:* and the path. To fix the link, change the path after `file=`.

Orbis Reader updates the deep links in reading records when the book moves. It updates only the part of the record that it writes, above the line that separates your own text.

---

## Deep link format

A deep link uses the `obsidian://orbis-nav` protocol. It names the book with `file`, and the location with one other parameter:

```
obsidian://orbis-nav?file=books/MyBook.epub&loc=120
```

| Parameter | What it does |
|---|---|
| `file` | Gives the path to the book in the vault. Required |
| `cfi` | Goes to an exact place in the book, as a CFI. Copied links use this parameter |
| `href` | Goes to a chapter or section, as a path inside the book, for example `OEBPS/chapter3.xhtml#part2` |
| `pct` | Goes to a percentage of the book, for example `pct=50` |
| `loc` | Goes to a location, for example `loc=120` |
| `listen` | Starts listening when the book opens, with `listen=1` |

If a link has more than one location parameter, Orbis Reader uses the first one in this order: `cfi`, `href`, `pct`, `loc`.

Encode the values, as a URL does: a space is `%20` and a `/` is `%2F`. A link with a simple path, such as the example above, also works.

A `loc` link needs the book's location index. The first time a large book opens, the index can take longer than a few seconds. Then the book opens but does not go to the location. Select the link again when the index is ready. See [Reading Progress](reading-progress.md).

---

## See also

- [Reading a Book](reading-a-book.md): describes how to move around a book
- [Marks and Notes](marks-and-notes.md): describes the marks bar and annotation notes
- [The .orbis File](orbis-file.md): describes the **Linked vault notes** tab
- [Command Reference](command-reference.md): lists every command, including **Copy link to current location**
