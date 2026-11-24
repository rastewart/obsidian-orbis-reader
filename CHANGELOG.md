# Changelog

All notable changes to Orbis Reader are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Orbis Reader uses [Semantic Versioning](https://semver.org/).

<!-- Each release has its own Added, Changed, Fixed and Removed, so a heading may repeat under different releases. -->
<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

---

## [0.1.8] — Unreleased

### Added

- **Bold text**, on the display style bar's **Font** tab and in Settings → Appearance. It draws all of the book's text heavier, and words the book makes bold stay bolder.
- **Page turn**, on the display style bar's **Layout** tab and in Settings → Appearance. **Slide** moves the page across as it turns in **Paged mode**; **None**, the default, changes it at once, as before. Pages change at once when the device is set to reduce motion.
- **Character spacing**, **Word spacing** and **Paragraph spacing**, on the display style bar's **Spacing** tab under **More**, and in Settings → Appearance. Each adds space to body text, in percent of the font size, and 0% keeps the book's own spacing. Headings, centered lines and code keep the book's spacing, and character spacing is not added to languages whose letters join, such as Arabic.

### Changed

- The display style bar's **Spacing** tab shows **Margins**, **Line spacing** and **Alignment**. **Hyphenation** is now behind **More**, a second page of the tab, with **Back** in the same place to return. **Spacing** on the tab is now named **Line spacing**.

### Fixed

- Dragging a slider on the display style bar moves it the whole way again where the tab's controls are stacked, as on a phone or in a narrow pane. Since 0.1.7 it moved one step and stopped; tapping along the slider still worked.
- On a phone turned sideways, a tab of the display style bar no longer runs under Obsidian's toolbar at the bottom of the screen. Its controls sit two across, and a tab still taller than the room left stops above the toolbar and scrolls.

## [0.1.7] — 2026-11-24

### Fixed

- Passage selections, notes and bookmarks are now listed in the order they appear in the book. Before, marks close together on a page were listed in the order you made them. This affected generated notes, the copy to clipboard commands, the Saved list in the side panel and the book's data page.
- A paragraph marked from the listening player while a recording played, with the mark button set to Paragraph, is now marked in the book. Before, the mark or note was saved but showed nothing. **Scan annotation data for problems** now offers **Repair** for marks and notes saved this way, and puts them back on their paragraph.
- A long chapter that Calibre split into two files is now one chapter in Save as Markdown, Save as PDF and the recording list. Before, the second half was a chapter of its own, named by the chapter and the book's title.
- **Open this link?** now calls a link with a space in its web address's host *Not a valid address* on desktop and Android, and offers only **Cancel**, as on iPhone and iPad. Before, it called the link a web page, showed the space as `%20` and offered **Open**. On every device, the dialog now says *This address can't be opened.* when it offers no **Open**.
- Save as Markdown and Save as PDF, selected soon after a book is first opened, now open their dialog only once Orbis has finished indexing the book. Until then, the notice *Preparing the chapter list…* shows.
- On a phone or in a narrow pane, the display style bar's Theme, Font and Spacing tabs line up their labels, sliders and dropdowns in columns.

## [0.1.6] — 2026-11-21

### Added

- **Hyphenation** in Settings → Appearance and on the display style bar's Spacing tab. It follows the book, hyphenates all body text, or turns hyphenation off. Obsidian on Windows and Linux does not hyphenate words automatically, so On has no effect there.
- The User Guide's Data and Storage page and the README's Storage and permissions section explain how Orbis Reader uses each item in the Community directory's review.

### Changed

- The test fixtures for Download test fixtures (dev) are in a release of their own, and each build downloads the fixtures from its own commit. A release of Orbis Reader holds only the three files Obsidian installs.

### Fixed

- On iPad and iPhone, the lines of a book that asks for balanced line breaks now break as they do on other devices. A page no longer ends with a short line that has room for more words.

## [0.1.5] — 2026-11-21

### Changed

- The squiggle in mark samples is drawn as a zigzag, as it is in the book.
- Changes to Orbis Reader's stylesheet for the Community directory's review. Everything else looks and works as before.

## [0.1.4] — 2026-11-20

### Changed

- The reader engine, foliate-js, now comes from Orbis's own fork of it, [rastewart/foliate-js](https://github.com/rastewart/foliate-js), instead of a copy kept in this repository. The Community directory's checks of the repository are then of Orbis's own code. Books look and work as before.
- Small changes to how Orbis adds elements to a book's pages, for the Community directory's review. Books look and work as before.

## [0.1.3] — 2026-11-20

### Added

- On a touch screen, a swipe turns the page in a CBZ book and in a fixed-layout EPUB. In a right-to-left book, such as manga, it turns in the book's own direction.

### Changed

- In a CBZ book or a fixed-layout EPUB, **Two-column layout** decides whether you see two pages side by side or one page at a time. Before, two pages showed whenever the reading area was wider than it is tall, with the setting on or off.

### Fixed

- A book's cover, and any other picture drawn the same way, is no longer stretched out of shape when one column fills a wide pane. This happened with covers made by Calibre.
- A book opened at its cover no longer shows the cover pushed sideways, sometimes almost off the page, until you turn a page.

## [0.1.2] — 2026-11-19

### Changed

- The About dialog shows a build ID in place of the build time and commit. The same release always shows the same ID.
- Small changes to the book renderer for the review of the Obsidian Community directory. Books look and work as before.

## [0.1.1] — 2026-11-19

### Fixed

- On iPhone and iPad with iOS or iPadOS earlier than 16.4, Orbis Reader could not load: two patterns it uses on a book's styles were written in a way those versions cannot read.

### Changed

- Small changes to the book renderer for the review of the Obsidian Community directory. Books look and work as before.

## [0.1.0] — 2026-11-18

The first release of Orbis Reader, an ebook reader for your vault on computers, tablets and phones. It needs Obsidian 1.14.4 or later.

### Added

- **Collect:** Open EPUB, MOBI, AZW3, FB2 and CBZ files. Browse, search and download books from Project Gutenberg, your own Calibre server and other OPDS catalogs. Turn a note, a web clipping or a folder of notes into a book.
- **Organize:** Turn on the library to get a title note for each book, and catalog every book in your vault in one pass, with covers. Track each book's reading status, your rating and when you finished it, and design dashboards that show your books as lists, covers or tables.
- **Read:** Combine fonts, reader themes, spacing and layout into display styles. Read in pages, as one scroll or in two columns, or with everything but the book hidden in Focus mode. Jump to a chapter, a location or a percentage and go back after a jump, preview footnotes and zoom into images. See your progress, the time left and your reading speed, and pick up where you left off in every book.
- **Explore:** Look up a word in offline dictionaries (Webster's 1913 and Open English WordNet), in your vault or on the web. Search a book's text and your annotations.
- **Listen:** Hear any book read aloud by natural-sounding voices that run on your device and work offline, with the text highlighted as it is read. Use the full-screen player, change the speed, and lock the controls with Pocket mode. Mark a passage, add a note or set a bookmark while you listen. Record a book to MP3 on your device or with your own Kokoro server, combine recordings and live voices in a mix, and teach voices how to say names and terms.
- **Annotate:** Bookmark your place, mark passages and attach notes. Give each annotation a mark that says what it means to you, with its own highlighter color, underline or other treatment, and badge, and keep presets of marks for different kinds of books.
- **Connect:** Turn on reading records for a vault note for every annotation, kept up to date as you read, with generated Obsidian Bases. Generate notes of your annotations or a chapter outline, and merge in later changes. Link to any passage from any note, and convert a book's text to Markdown.
- **Share:** Save a book as a PDF with your marks and notes, or a PDF digest of your annotations. Save a book as Markdown, or your notes as an EPUB. On a computer, export a file outside the vault; on a phone or tablet, share it.
- **Foundations:** Turn on only the features you want from the Setup page, and bind any command to a hotkey. Use the same vault on several devices with the sync you already have, sharing your reading location and your settings. No accounts, ads or telemetry: your book files are never changed, and your data stays in plain files in your vault.
