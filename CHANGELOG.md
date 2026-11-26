# Changelog

All notable changes to Orbis Reader are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Orbis Reader uses [Semantic Versioning](https://semver.org/).

<!-- Each release has its own Added, Changed, Fixed and Removed, so a heading may repeat under different releases. -->
<!-- Orbis Reader shows these notes in its What's new dialog. Lines for maintainers and reviewers, not readers, go under Maintenance, which the dialog leaves out. -->
<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

---

## [0.1.9] — Unreleased

### Added

- **Fonts**, a new page in Orbis Reader settings. **Import…** adds a font's TrueType or OpenType files, or the zip file they came in, from your device to a fonts folder in the vault, `!orbis-data/fonts`, so the font reaches your other devices with the rest of the vault. Imported fonts are offered in the **Font** list of display styles. A switch for each font, imported or a system font, shows or hides it in the **Font** list. A font that this device does not have is marked *not on this device*. Changing **Vault folder for fonts** moves the fonts into the new folder.
- **Downloadable fonts**, on the Fonts page. They are OpenDyslexic for readers with dyslexia, Atkinson Hyperlegible for readers with low vision, Lexend, Literata, Source Serif 4 and EB Garamond. Each downloads from Orbis Reader's releases on GitHub with its license, into the fonts folder, and is free to use in a PDF or EPUB you share.
- **Font** for Save as PDF and Save annotations as PDF, on both settings pages and in the dialog. It sets the font for the book's text. The list has the fonts in your vault that a PDF can use, including fonts hidden from the **Font** list of display styles. Text in a face the font does not have, and characters it cannot draw, use the default font.
- **Font** for Save note as EPUB and the folder conversions, on the Save as EPUB settings page and in each dialog's **Book details**. The font's files go into the book, which is set in it. The list has the same fonts as the list for PDFs.
- **What's new**, a button on the last row of Orbis Reader settings, shows the changes in each release. After an update, a notice says that Orbis Reader was updated, with a link to what is new. To stop the notice on a device, turn off **Show what's new after an update** at the foot of the dialog.

### Changed

- The **Expanded character set** for PDFs (the DejaVu fonts) now downloads into your vault's fonts folder, from Orbis Reader's releases on GitHub, so your sync tool copies it to your other devices. It is listed on the Fonts page, where you can also delete it, and no longer on the Save as PDF settings page. A copy that an earlier version downloaded into the plugin folder is used until the fonts are in the vault, then deleted.
- On a phone or tablet, a swipe that starts on a bar under the toolbar no longer opens Obsidian's side panels or command palette, so a slider or button on the bar can't open a panel by mistake. The bars are the display style bar, the search bar, the Go to bar, the listening bar and the marks bar. A swipe across the ‹ or › page button doesn't open them either. Swipes from the toolbar, and from the edges of the page above and below the page buttons, work as before.
- **Two-column layout** on the display style bar's **Layout** tab is now a labeled switch under **Page turn**, like **Bold text** on the **Font** tab, in place of the icon button beside **Mode**. Like **Page turn**, it shows in **Paged mode** only.
- A slider on the display style bar is longer when a tab's controls are on one line, so **Size** and **Brightness** are easier to set. A tab without room for the longer slider stacks its controls in rows, as the **Font** tab now does on an iPad mini held upright.

### Fixed

- A book's own fonts, and its images that had not loaded yet, could fail to show in the chapter you were reading. Orbis's work in the background — counting locations, searching, reading aloud, exporting and link previews — let go of files the reader still needed. It happened only sometimes, depending on which finished first.

### Maintenance

- `pnpm build:fonts` builds the zips of the `fonts` release from pinned sources, and pins each zip's size and SHA-256 in `src/font-pins.ts`. The `fonts.yml` workflow builds them on main, checks them against the pins and the zips already in the release, uploads only what the release lacks, and attests every zip.
- The User Guide is checked against this release. Data and Storage now says which downloads are checked against a checksum and when, and the guide describes **Repair** in **Scan annotation data for problems**, the order of marks in copies and generated notes, and the search bar's controls in the order they show.

## [0.1.8] — 2026-11-24

### Added

- **Bold text**, on the display style bar's **Font** tab and in Settings → Appearance. It draws all of the book's text heavier, and words the book makes bold stay bolder.
- **Page turn**, on the display style bar's **Layout** tab and in Settings → Appearance. **Slide** moves the page across as it turns in **Paged mode**; **None**, the default, changes it at once, as before. Pages change at once when the device is set to reduce motion.
- **Character spacing**, **Word spacing** and **Paragraph spacing**, on the display style bar's **Spacing** tab under **More**, and in Settings → Appearance. Each sets the spacing of body text, in percent of the font size, and 0% keeps the book's own spacing. Headings, centered lines and code keep the book's spacing, and character spacing is not added to languages whose letters join, such as Arabic.

### Changed

- The display style bar's **Spacing** tab shows **Margins**, **Line spacing** and **Alignment**. **Hyphenation** is now behind **More**, a second page of the tab, with **Back** in the same place to return. **Spacing** on the tab is now named **Line spacing**.

### Fixed

- Dragging a slider on the display style bar moves it the whole way again where the tab's controls are stacked, as on a phone or in a narrow pane. Since 0.1.7 it moved one step and stopped; tapping along the slider still worked.
- On a phone turned sideways, a tab of the display style bar no longer runs under Obsidian's toolbar at the bottom of the screen. Its controls sit two across, and a tab still taller than the room left stops above the toolbar and scrolls.

## [0.1.7] — 2026-11-24

### Fixed

- Passage selections, notes and bookmarks are now listed in the order they appear in the book. Before, marks close together on a page were listed in the order you made them. This affected generated notes, the copy to clipboard commands, the Saved list in the side panel and the book's data page.
- A mark made just after another is no longer lost. Before, if the book's marks were reloaded between the two saves, the newer mark could be dropped.
- A paragraph marked from the listening player while a recording played, with the mark button set to Paragraph, is now marked in the book. Before, the mark or note was saved but showed nothing. **Scan annotation data for problems** now offers **Repair** for marks and notes saved this way, and puts them back on their paragraph.
- A long chapter that Calibre split into two files is now one chapter in Save as Markdown, Save as PDF and the recording list. Before, the second half was a chapter of its own, named by the chapter and the book's title.
- **Open this link?** now calls a link with a space in its web address's host *Not a valid address* on desktop and Android, and offers only **Cancel**, as on iPhone and iPad. Before, it called the link a web page, showed the space as `%20` and offered **Open**. On every device, the dialog now says *This address can't be opened.* when it offers no **Open**.
- Save as Markdown and Save as PDF, selected soon after a book is first opened, now open their dialog only once Orbis has finished indexing the book. Until then, the notice *Preparing the chapter list…* shows.
- On a phone or in a narrow pane, the display style bar's Theme, Font and Spacing tabs line up their labels, sliders and dropdowns in columns.

## [0.1.6] — 2026-11-21

### Added

- **Hyphenation** in Settings → Appearance and on the display style bar's Spacing tab. It follows the book, hyphenates all body text, or turns hyphenation off. Obsidian on Windows and Linux does not hyphenate words automatically, so On has no effect there.

### Fixed

- On iPad and iPhone, the lines of a book that asks for balanced line breaks now break as they do on other devices. A page no longer ends with a short line that has room for more words.

### Maintenance

- The User Guide's Data and Storage page and the README's Storage and permissions section explain how Orbis Reader uses each item in the Community directory's review.
- The test fixtures for Download test fixtures (dev) are in a release of their own, and each build downloads the fixtures from its own commit. A release of Orbis Reader holds only the three files Obsidian installs.

## [0.1.5] — 2026-11-21

### Changed

- The squiggle in mark samples is drawn as a zigzag, as it is in the book.

### Maintenance

- Changes to Orbis Reader's stylesheet for the Community directory's review. Everything else looks and works as before.

## [0.1.4] — 2026-11-20

### Maintenance

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

### Maintenance

- Small changes to the book renderer for the review of the Obsidian Community directory. Books look and work as before.

## [0.1.1] — 2026-11-19

### Fixed

- On iPhone and iPad with iOS or iPadOS earlier than 16.4, Orbis Reader could not load: two patterns it uses on a book's styles were written in a way those versions cannot read.

### Maintenance

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
