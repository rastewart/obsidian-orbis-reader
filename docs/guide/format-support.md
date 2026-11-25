# Format Support

← [User Guide](README.md)

---

## Overview

Orbis Reader opens five book formats. When the plugin is enabled, a file in your vault with one of these extensions opens in the reader when you select it.

| Format | Extension | Description |
|---|---|---|
| **EPUB** | `.epub` | The standard ebook format. Project Gutenberg, Standard Ebooks, most retailers and most library loans use it |
| **MOBI** | `.mobi` | An older Amazon Kindle format |
| **AZW3** | `.azw3` | The newer Amazon Kindle format |
| **FB2** | `.fb2` | An XML ebook format, common in Russian and Eastern European book collections |
| **CBZ** | `.cbz` | A zip file of images, for comics, manga and scanned books |

When you have a choice of format, use EPUB. Every feature in this guide works with EPUB.

---

## Zoom in on a CBZ page

1. Select the page. The page opens in the image viewer.
2. Pinch or scroll to zoom.

Use this to read small lettering on a phone. See [Reading a Book](reading-a-book.md) for the image viewer.

---

## Text formats and image formats

EPUB, MOBI, AZW3 and FB2 contain text. CBZ contains only images: each page is a picture. A CBZ book has no text to select, search or listen to.

| Feature | EPUB, MOBI, AZW3, FB2 | CBZ |
|---|---|---|
| **Read the book** | ✓ | ✓ |
| **Turn pages, use the table of contents** | ✓ | ✓ |
| **Reading progress and locations** | ✓ | ✓, by page |
| **Deep links** | ✓ | ✓ |
| **Select an image to zoom in** | ✓ | ✓, the page itself |
| **Covers and cataloging** | ✓ | ✓ |
| **Select text** | ✓ | — |
| **Passage selections, notes and bookmarks** | ✓ | — |
| **Search** | ✓ | — |
| **Look-up** | ✓ | — |
| **Listening and recordings** | ✓ | — |
| **Reading speed and time remaining** | ✓ | —, no words to count |
| **Generate notes, Save as Markdown, Save as PDF** | ✓ | — |
| **Reading records** | ✓ | — |

You can read and track your progress in a CBZ book, but you cannot annotate it.

---

## Notes on each format

### EPUB

Everything in this guide applies to EPUB.

### MOBI and AZW3

MOBI and AZW3 books work like EPUB books. Text, annotations, search and listening work the same way.

### FB2

An FB2 book is one XML file. It works like the other text formats.

### CBZ

You turn pages, and reading progress and deep links work, as in other formats. In a right-to-left book, such as manga, a swipe turns the page in the book's own direction. **Two-column layout** decides whether you see two pages side by side or one at a time. See [Display Settings](display-settings.md). **Page turn** has no effect. The other features rely on text, which a CBZ book does not have. See [Text formats and image formats](#text-formats-and-image-formats).

The cover of a CBZ book is the first image in the file. This is almost always the cover.

---

## What each format gives the Library

When Orbis Reader catalogs a book, it reads the book's details from the file to make the title note. The details that it can read depend on the format, and on what the person who made the file included. See [Library Dashboards](library-dashboards.md) for what each property does.

| Format | Details that cataloging reads | Cover |
|---|---|---|
| **EPUB** | Title, authors, publisher, publication date, language, ISBN, series and series index, from the book's OPF file | ✓ From the book |
| **FB2** | Title, authors, publisher, publication year, language, ISBN, series and series index | ✓ From the book |
| **MOBI and AZW3** | Title, authors, publisher, publication date, language | ✓ From the book |
| **CBZ** | No details. A CBZ file has no metadata | ✓ The first image |

For a CBZ book, the title comes from the file name. Orbis Reader does not take an author from a file name. A CBZ book usually gets a title note with a title and no author. You can add the author to the title note.

Every book gets a cover. If Orbis Reader cannot find a book's cover, it makes one. See [Library Dashboards](library-dashboards.md).

---

## Downloading books

An OPDS feed in [Book Sources](book-sources.md) lists each book in the formats that its publisher chose. Orbis Reader downloads the first of these formats that the feed lists: EPUB, AZW3, MOBI, CBZ, then FB2.

Some books are available only in formats that Orbis Reader cannot open, such as PDF or a file with DRM. The row of such a book shows **Not a format Orbis Reader opens** before you select it.

---

## Formats that Orbis Reader does not open

Orbis Reader cannot open a book that has DRM copy protection, such as many books bought from Amazon and other stores.

Orbis Reader does not open PDF files. To read a PDF, use Obsidian's own PDF viewer. Orbis Reader can write a PDF from a book. See [Save as PDF](save-as-pdf.md).

Orbis Reader does not open plain text, HTML, DOCX or audiobook files. To read a Markdown note, convert it with [Notes to EPUB](notes-to-epub.md) or [Read in Orbis Reader](read-in-orbis-reader.md), then open the result.

---

## Troubleshooting

### A book does not work as expected

Ebook files from different sources follow their format's specification more or less closely. Navigation, table of contents links and search results depend on how well the file was made.

If a book does not work as expected, try the same book from a different source, or in a different format.

---

## See also

- [Getting Started](getting-started.md): describes how to open your first book
- [Book Sources](book-sources.md): describes how to download books from OPDS feeds
- [Library Dashboards](library-dashboards.md): describes what cataloging does with a book's details
- [Save as Markdown](save-as-markdown.md): converts a book into Markdown notes
- [Troubleshooting](troubleshooting.md): describes what to do when a book does not open
