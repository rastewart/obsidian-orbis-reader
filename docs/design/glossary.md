# Glossary

← [Design Docs](README.md)

This file records the terminology review of the user guide. All "Decision needed" items are decided. The approved terms are summarized in [terminology.md](terminology.md), and the UI label changes are made (October 2026). The old labels are retired in `scripts/check-vocabulary.ts`.

## Existing vocabulary rules

From `scripts/check-vocabulary.ts`, which checks the guide and the interface strings. These are settled, so none of them is a "Decision needed" item below.

- **Export to vault** → Save as Markdown
- **Export book to vault** → Save as Markdown
- **Generate notes file** → Generate notes
- **Open or create notes file** → Open notes
- **Save marks as PDF** → Save annotations as PDF
- **note export style** → notes style
- **annotation export style** → notes style
- **Notes & Export** → Conversions
- **audiobook** → "recorded book", or "read aloud with text-to-speech". Allowed in format-support.md, where it names a file format Orbis cannot open.
- **tap** and **click** → select, and **tapping** and **clicking** → selecting. Each is allowed beside the other device's gesture: tap with click or right-click; click with tap, touch, long-press or press and hold.
- **Safe mode** → Restricted mode
- **colour** → color, **colours** → colors, **labelled** → labeled

## Conventions

Patterns that apply across many terms, reported once here rather than in each entry.

- **Spelling: gray and grey.** The guide spells it "gray" ("grayed out", the **Gray** theme) except once: "grey dots" in book-sources.md. Counts: gray (12); grey (1). Options: "gray" everywhere, or allow both.
  **Decision**: "gray" everywhere
- **Ellipsis on menu items and commands.** A command or menu item that opens a dialog ends in "…" (**Generate notes…**, **Set reading status…**, **Reading record settings…**), and Read in Orbis Reader has none because it asks nothing (read-in-orbis-reader.md). In prose the same items often appear without it: "Run **Set reading status**" (reading-progress.md), "**Reading record settings** item" (exporting-and-converting.md), "**Manage recordings and mixes**" (listening.md). Options: Always write the "…" when naming the item; or drop it in prose and keep it only in tables of commands.
  **Decision**: Drop it in prose and keep it only in tables of commands.
- **Capitalization of page titles and headings.** Guide page titles mix Title Case ("Getting Started", "Display Settings", "Reading Progress", "Settings Reference", "Format Support", "Command Reference", "Listening (Read Aloud)") and sentence case ("Reading a book", "Marks and notes", "Book sources", "Sync and devices"); README.md's table follows each page. Options: Sentence case for every title and heading, matching dialog titles such as "Turn on book sources"; or Title Case for page titles only.
  **Decision**:  Title Case for page titles only.
- **Capitalization of feature names in prose.** Feature names are capitalized in some sentences and not others: "Book sources" and "book sources", "Reading records" and "reading records", "the Library" and "the library", "Listening" and "listening". Options: Capitalize a feature's name wherever it names the feature; or capitalize only UI labels.
  **Decision**: Capitalize a feature's name wherever it names the feature
  **Revision (Oct 14):** Feature names use sentence case (Focus mode, Pocket mode, Book sources, Reading records). The list of feature names is in terminology.md.
- **Capitalization of format names.** Format names are uppercase in most pages (EPUB, MOBI, AZW3, FB2, CBZ) and lowercase in lists of extensions in README.md, getting-started.md and reading-a-book.md ("epub, mobi, azw3, cbz, fb2"), and in "an internal epub link" (command-reference.md). Options: Uppercase for the format and `.epub` style for the extension; or lowercase in lists.
  **Decision**: Uppercase for the format and `.epub` style for the extension
- **Hyphenation of compound modifiers.** Compound modifiers are hyphenated inconsistently: "full-screen audio player" and "full screen audio player"; "per-device answers" and "a per device setting"; "re-open" (reading-progress.md) and "reopen". Counts: full-screen (25); full screen (7); per-device (3); per device (24); re-open (2); reopen (7). Options: Hyphenate a compound before a noun ("full-screen player", "per-device setting") and not after it ("set per device"); or another single rule.
  **Decision**: Hyphenate a compound before a noun ("full-screen player", "per-device setting") and not after it ("set per device")
- **Settings paths.** Paths to Orbis settings appear in three forms: with the plugin ("Settings → Orbis Reader → Reading behavior"), without it ("Settings → Reading behavior", "Settings → Look-up", "Settings → Devices"), and starting mid-way ("Reading behavior → Confirm before deleting notes", marks-and-notes.md). Counts: Settings → Orbis Reader → … (17); Settings → … without the plugin (43). Options: Always the full path from Settings; or the full path on first mention in a page and the short form after.
  **Decision**: The full path on first mention in a page and the short form after.
  **Revision (Oct 14):** Write the full path the first time in a section ("Settings → Orbis Reader → Reading behavior"). After that, write only the page or setting name (**Reading behavior**).
- **Short references after first mention.** After naming a thing in full, the guide refers to it as "the panel", "the bar", "the player", "the dialog", "the glossary" or "the review". These are not counted as variants in the entries below. Options: Keep short references; or always repeat the full name.
  **Decision**: Keep short references
- **Close button glyph.** The close button is written "×" in most pages and "✕" in reading-a-book.md's image viewer table and text. Counts: × (17); ✕ (2). Options: One glyph everywhere.
  **Decision**: One glyph everywhere: X.
  **Revision (Oct 14):** Write the close button as "X". See the open question in terminology.md about naming the button instead.
  **Revision 2 (Oct 14):** Call it the Close button. Do not write "X", "×" or "✕".
- **Keyboard shortcut notation.** Shortcuts are written `Ctrl/Cmd+P` in most pages and `Ctrl+P` / `Cmd+P` in command-reference.md. Counts: Ctrl/Cmd+… (8); Ctrl+P / Cmd+P (1). Options: `Ctrl/Cmd+P` everywhere; or separate keys everywhere.
  **Decision**: `Ctrl/Cmd+P` everywhere.
- **Capitalization of approved terms.** *(Added Oct 14.)*
  **Decision**: Approved terms are lowercase in prose unless they are an exact UI label, a feature name, or a proper name. Paged mode and scrolled mode are both lowercase.
  **Revision 2 (Oct 14):** Paged mode and Scrolled mode are UI option labels, so they keep sentence case.
- **Button and icon.** *(Added Oct 14.)*
  **Decision**: Use "button" for anything the user selects. Use "icon" only to describe the picture on it.
- **Long form first, short form after.** *(Added Oct 14.)*
  **Decision**: Where a term has a long and a short form (annotation note, annotation preset, OPDS feed, command palette, Obsidian base, Obsidian keychain, Webster's 1913, Open English WordNet, text-to-speech (TTS)), write the long form the first time in a section and the short form after.
- **Product name.** *(Added Oct 14.)*
  **Decision**: Write "Orbis Reader", not "Orbis". See the Orbis Reader entry.
  **Revision 2 (Oct 14):** UI labels and names that say "Orbis" keep it: Orbis voice, Orbis marks, Share Orbis configuration in the vault, and Orbis configuration sharing.
- **UI element types.** *(Added Oct 14.)*
  **Decision**: Call windows "dialogs", the rows under the toolbar "bars", and the parts of the Navigator "tabs". Do not use "popup", "drawer" or "panel". See the dialog entry.
  **Revision 2 (Oct 14):** The marks bar is the "marks bar" on every device, including a phone.

## Concepts

### !orbis-data

- **Status:** Consistent
- **Variants:** None
- **Definition:** The folder beside your books where Orbis keeps each book's .orbis file, location files and recordings; one per folder of books.
- **Files:** orbis-file.md, reading-progress.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### .orbis file

- **Status:** Decided
- **Variants:** Orbis file (6); annotation file (1)
- **Definition:** The file Orbis keeps for every book, holding its annotations, reading statistics and cached details; it renders as a page.
- **Files:** annotations-and-presets.md, marks-and-notes.md, orbis-file.md, reading-progress.md, reading-records.md, sync-and-devices.md, troubleshooting.md
- **Issues:** "Orbis file" in orbis-file.md's title and sync-and-devices.md; "annotation file" once in troubleshooting.md.
- **Approved term:** .orbis file
- **Notes:**

### alias

- **Status:** Consistent
- **Variants:** None
- **Definition:** Your own frontmatter key mapped onto a library field, so the library reads it as that field.
- **Files:** library-dashboards.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### annotation

- **Status:** Decided
- **Variants:** your marks (29); saved item (1)
- **Definition:** Everything you add to a book: a passage selection wearing a mark, a note with or without one, or a bookmark.
- **Files:** README.md, annotations-and-presets.md, command-reference.md, generate-notes.md, exporting-and-converting.md, library-dashboards.md, look-up.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** Also called "saved items" (search.md) and "your marks" (exporting-and-converting.md, "What 'your marks' means"); the content panel tab for them is **Saved**.
- **Approved term:** annotation
- **Notes:** Referring to bookmarks, passage selections, and notes (with or without a mark) all as "annotations" seems to be the best way of covering everything.

### appearance

- **Status:** Decided
- **Variants:** None
- **Definition:** What a mark looks like in the book: a highlighter, a treatment, or both, each in a color.
- **Files:** annotations-and-presets.md, display-settings.md, getting-started.md, marks-and-notes.md, reading-a-book.md, settings-reference.md
- **Issues:** annotations-and-presets.md alternates between "appearance" and "look" for the same thing ("a different look", "in its own look", "its own look gives it").
- **Approved term:** appearance
- **Notes:**

### audio bookmark

- **Status:** Consistent
- **Variants:** None
- **Definition:** A bookmark anchored to the sentence being read aloud rather than to the page, shown with a headphones glyph.
- **Files:** listening.md, marks-and-notes.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### back icon

- **Status:** Decided
- **Variants:** back and forward buttons (1); forward icon (1)
- **Definition:** Arrows at the top right of the page after a jump, which go back and forward through places you have visited.
- **Files:** reading-a-book.md
- **Issues:** reading-a-book.md calls them "back icon" and "forward icon", then "back and forward buttons"; command-reference.md says "floating back/forward buttons".
- **Approved term:** back and forward buttons
- **Notes:**
- **Revision (Oct 14):** Rule: "button" for anything the user selects.

### badge

- **Status:** Consistent
- **Variants:** None
- **Definition:** A short stand-in for a mark, an emoji by default, used wherever color cannot be shown, such as Markdown.
- **Files:** annotations-and-presets.md, generate-notes.md, save-annotations-as-pdf.md, save-as-pdf.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Book folder

- **Status:** Decided
- **Variants:** per-chapter (2)
- **Definition:** The format that writes one note per chapter, plus a contents note, inside a folder.
- **Files:** generate-notes.md, save-as-markdown.md, settings-reference.md, troubleshooting.md
- **Issues:** "per-chapter" in troubleshooting.md ("for per-chapter").
- **Approved term:** book folder
- **Notes:**

### bookmark

- **Status:** Consistent
- **Variants:** None
- **Definition:** A location in the book to come back to; it carries no mark and no text of its own.
- **Files:** README.md, command-reference.md, generate-notes.md, exporting-and-converting.md, library-dashboards.md, listening.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**
- **Revision 3 (Oct 14):** The definition is out of date. A bookmark is now anchored to the sentence at the top of the page when you create it, and it includes that sentence. Only the bookmark's reading record shows the sentence, as its excerpt. Generate notes, Save annotations as PDF and Copy bookmarks to clipboard do not include it. An audio bookmark is anchored to the sentence that is being read.

### catalog

- **Status:** Decided
- **Variants:** cataloging (10)
- **Definition:** Writing a title note for a book from its own metadata.
- **Files:** README.md, book-sources.md, format-support.md, library-dashboards.md, settings-reference.md
- **Issues:** "catalog" names the Library itself ("The Library is a catalog", "Your catalog") and an online OPDS collection ("Browsing online catalogs", README.md).
- **Approved term:** catalog
- **Notes:**

### catalog review

- **Status:** Decided
- **Variants:** cataloging review (1); uncataloged review (1)
- **Definition:** One screen listing uncataloged books and possible matches, to create or update title notes in bulk.
- **Files:** book-sources.md, library-dashboards.md
- **Issues:** "cataloging review" in book-sources.md; "uncataloged review" in library-dashboards.md; often "the review".
- **Approved term:** catalog review
- **Notes:**

### chapter

- **Status:** Consistent
- **Variants:** None
- **Definition:** A top-level entry in the book's own table of contents, covering the headings beneath it; an entry that groups chapters opens into them.
- **Files:** README.md, command-reference.md, generate-notes.md, getting-started.md, exporting-and-converting.md, listening.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, search.md, settings-reference.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### chapter note

- **Status:** Consistent
- **Variants:** None
- **Definition:** One note per chapter in a book folder, with frontmatter that links it to the other chapters.
- **Files:** generate-notes.md, notes-to-epub.md, save-as-markdown.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### collection

- **Status:** Consistent
- **Variants:** None
- **Definition:** A named set of titles defined by filters; every widget draws from one.
- **Files:** README.md, book-sources.md, format-support.md, getting-started.md, library-dashboards.md, reading-progress.md, reading-records.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### condition

- **Status:** Consistent
- **Variants:** None
- **Definition:** One rule in a collection's filters, such as reading_status is interested.
- **Files:** library-dashboards.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### content panel

- **Status:** Decided
- **Variants:** contents panel (2)
- **Definition:** The panel that slides in from the left with five tabs: Contents, Search, Saved, Linked vault notes and Stats.
- **Files:** command-reference.md, getting-started.md, marks-and-notes.md, orbis-file.md, reading-a-book.md, reading-progress.md, search.md, settings-reference.md
- **Issues:** "contents panel" in getting-started.md and the command **Open contents panel**; the toolbar setting is **Content panel**; the toolbar button is **Contents, search and saved**.
- **Approved term:** Navigator
- **Notes:** The naming around this is somewhat confusing currently.  The toolbar button is referred to as "content panel".  The first panel in the content panel is the "contents panel" which shows the table of contents in the book.  Seems like it would be clearer to name the entire panel something else so I'm proposing calling it "Navigator" which encompasses all navigation functions including the contents panel, search panel, saved annotations panel, links panel, and reading stats panel. Review and provide feedback.
- **Revision (Oct 14):** Its parts are tabs, not panels: Contents, Search, Annotations, Linked vault notes, Stats. The toolbar button, the Toolbar setting and the Open … panel commands change with it.
- **Revision 2 (Oct 14):** Keep the tab name Linked vault notes.

### contents note

- **Status:** Consistent
- **Variants:** None
- **Definition:** In a book folder, the note 000 - {Book Title}.md listing every chapter note in the set.
- **Files:** generate-notes.md, notes-to-epub.md, save-as-markdown.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### context menu

- **Status:** Consistent
- **Variants:** None
- **Definition:** The menu you open on a note, folder or book in the Files pane by right-clicking or long-pressing.
- **Files:** command-reference.md, exporting-and-converting.md, notes-to-epub.md, read-in-orbis-reader.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Continuous scroll

- **Status:** Decided
- **Variants:** scrolled view (3); scrolled mode (1)
- **Definition:** The reading mode that replaces pages with one long scroll for the current section of the book; always one column.
- **Files:** command-reference.md, display-settings.md, reading-a-book.md
- **Issues:** The command is **Toggle scrolled view**; reading-a-book.md says "scrolled mode"; settings-reference.md says "scrolled"; command-reference.md says "continuous scroll layout".
- **Approved term:** Scrolled mode
- **Notes:** The two ways of showing the book content are "paged mode" and the parallel way of expressing the alternative would be "scrolled mode".  Currently the dropdown says "Continuous scroll" but that doesn't sound the same.  It should be parallel right?
- **Revision (Oct 14):** Lowercase, to match paged mode. The dropdown option becomes Scrolled and the command becomes Toggle scrolled mode.
- **Revision 2 (Oct 14):** Scrolled mode, in sentence case, to match the existing UI option Paged mode. The option label changes from Continuous scroll to Scrolled mode.

### cover

- **Status:** Consistent
- **Variants:** None
- **Definition:** A real image file in the vault that a title note's cover field points at, extracted from the book or generated.
- **Files:** book-sources.md, command-reference.md, format-support.md, generate-notes.md, library-dashboards.md, listening.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, reading-a-book.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, search.md, settings-reference.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### cover sheet

- **Status:** Consistent
- **Variants:** None
- **Definition:** A first page of a Save as PDF file with the title and the legend.
- **Files:** save-annotations-as-pdf.md, save-as-pdf.md, settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### custom field

- **Status:** Decided
- **Variants:** None
- **Definition:** A field of your own added on the Fields page, which can become a column, a group or a filter.
- **Files:** library-dashboards.md, settings-reference.md
- **Issues:** None
- **Approved term:** custom property
- **Notes:** See other notes on this one.  The vocabulary that Obsidian has adopted for the front matter on an Obsidian note is the refer to the items as properties.  If we're going to be consistent with that vocabulary then this should be changed from "custom field" to "custom property".

### dashboard

- **Status:** Consistent
- **Variants:** None
- **Definition:** An ordered set of widgets showing your titles or annotations.
- **Files:** README.md, getting-started.md, library-dashboards.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### data.json

- **Status:** Decided
- **Variants:** plugin's settings file (1)
- **Definition:** The plugin's own data file, where Orbis keeps its settings on each device.
- **Files:** book-sources.md, sync-and-devices.md
- **Issues:** "plugin's settings file" (book-sources.md), "plugin's own data file" and "plugin's own data" (sync-and-devices.md).
- **Approved term:** plugin's settings file
- **Notes:** Calling it data.json will only make sense to a developer who knows what it is.
- **Revision (Oct 14):** On sync-and-devices.md, write "the plugin's settings file (`data.json`)", because readers there need the file name.

### deep link

- **Status:** Consistent
- **Variants:** None
- **Definition:** An obsidian://orbis-nav link to a place in a book; selecting it opens the book there.
- **Files:** command-reference.md, format-support.md, getting-started.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### default preset

- **Status:** Consistent
- **Variants:** None
- **Definition:** The preset a book gets when it is first opened; it cannot be deactivated.
- **Files:** annotations-and-presets.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### device

- **Status:** Consistent
- **Variants:** None
- **Definition:** One copy of one vault on one machine; the same laptop opening two vaults is two devices.
- **Files:** README.md, annotations-and-presets.md, book-sources.md, command-reference.md, display-settings.md, getting-started.md, library-dashboards.md, listening.md, marks-and-notes.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-progress.md, reading-records.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### device id

- **Status:** Consistent
- **Variants:** None
- **Definition:** A random identifier for each device and vault, used in the names of the files Orbis writes; read-only.
- **Files:** orbis-file.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Device locations

- **Status:** Decided
- **Variants:** sync prompt (1)
- **Definition:** The popup at book open, when another device read further, listing each device's location with a Go button.
- **Files:** sync-and-devices.md, troubleshooting.md
- **Issues:** troubleshooting.md heads it "Sync prompt"; it is also "the prompt" and "the Device locations list"; the command is **Show reading locations on all devices**.
- **Approved term:** Device locations
- **Notes:**
- **Revision (Oct 14):** It is a dialog. Do not call it a popup.

### Device name

- **Status:** Consistent
- **Variants:** None
- **Definition:** A label you give a device, shown wherever Orbis tells you about another device; blank shows the device ID.
- **Files:** settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### dialog

- **Status:** Decided
- **Variants:** popup (13); drawer (3)
- **Definition:** A window that opens over the reader or settings, with a title and its own controls.
- **Files:** (added Oct 14)
- **Issues:** The guide also says "popup" (Look up, Voice and source, Device locations) and "drawer" (the marks bar on a phone).
- **Approved term:** dialog
- **Notes:**
- **Revision (Oct 14):** Call these windows dialogs. Do not use "popup" for a dialog. Link preview is not a dialog: describe it as a preview. For the marks bar on a phone, say where the bar appears instead of calling it a drawer. "Pane" is Obsidian's term for the area a file opens in, so it stays. "Panel" is retired: see Navigator.
- **Revision 2 (Oct 14):** The Look-up, Voice and source, and Device locations windows are dialogs. Link preview shows a preview. The marks bar is the marks bar on every device.

### digest

- **Status:** Consistent
- **Variants:** None
- **Definition:** What Save annotations as PDF writes: your passage selections and notes under their chapters, without the book's text.
- **Files:** README.md, command-reference.md, exporting-and-converting.md, marks-and-notes.md, save-annotations-as-pdf.md, save-as-pdf.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### display name

- **Status:** Decided
- **Variants:** Shown as (3)
- **Definition:** The name a field's value is shown with in the library, while the note keeps the stored value.
- **Files:** library-dashboards.md
- **Issues:** Called "display name" (library-dashboards.md, Fields) and set with **Shown as**.
- **Approved term:** display name
- **Notes:** Need to change what the Forms dialog says.  Currently the label says "Shown as".  However, calling it the "Display name" is more clear.
- **Revision (Oct 14):** Lowercase in prose. The UI label changes from Shown as to Display name on the Properties page (formerly Fields).

### display style

- **Status:** Decided
- **Variants:** None
- **Definition:** All of the display settings saved under a name; one style is always the active one.
- **Files:** README.md, command-reference.md, display-settings.md, reading-a-book.md, settings-reference.md, sync-and-devices.md
- **Issues:** Shortened to "style", which also names a notes style (generate-notes.md).
- **Approved term:** display style
- **Notes:** need to stick with the longer name "display style" to avoid confusion.

### display toolbar

- **Status:** Decided
- **Variants:** display menu (1); display style toolbar (1)
- **Definition:** The toolbar the Display style button opens under the main toolbar, with Theme, Layout, Spacing and Font tabs.
- **Files:** command-reference.md, display-settings.md, listening.md
- **Issues:** "display toolbar" in display-settings.md and command-reference.md; "display menu" in listening.md; reading-a-book.md says "the Display style tabs and controls".
- **Approved term:** display style bar
- **Notes:** Original decision: Display style icon - for the icon | display style tabs and controls when referring to all of the selections that can be made when selecting the Display style icon in the toolbar
- **Revision (Oct 14):** Singular, because you edit only the current display style. The toolbar control is the Display style button.

### exit button

- **Status:** Consistent
- **Variants:** None
- **Definition:** The floating button at the top right in focus mode that leaves it.
- **Files:** command-reference.md, reading-a-book.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### expanded character set

- **Status:** Decided
- **Variants:** PDF character set (2)
- **Definition:** A one-time 3.1 MB font download, kept on the device, that lets PDFs print far more than about 220 characters.
- **Files:** save-annotations-as-pdf.md, save-as-pdf.md, settings-reference.md
- **Issues:** Setup offers it as **PDF character set**; getting-started.md calls it "the fonts Save as PDF needs".
- **Approved term:** expanded character set
- **Notes:**
- **Revision 2 (Oct 14):** Keep the UI label Expanded character set. Its settings row already says it is for PDFs, so "PDF" adds nothing.

### feature

- **Status:** Decided
- **Variants:** capability (6)
- **Definition:** One of the optional parts of Orbis, such as Book sources or the Library, turned on from Setup.
- **Files:** book-sources.md, format-support.md, getting-started.md, reading-records.md, settings-reference.md, sync-and-devices.md
- **Issues:** "capability" in getting-started.md and settings-reference.md (Setup); "feature" for the same things in book-sources.md and reading-records.md. The count of "feature" includes other uses.
- **Approved term:** feature
- **Notes:**

### field

- **Status:** Decided
- **Variants:** None
- **Definition:** A frontmatter value the library knows about, such as reading_status; aliases map your own keys onto it.
- **Files:** annotations-and-presets.md, book-sources.md, format-support.md, generate-notes.md, library-dashboards.md, notes-to-epub.md, reading-a-book.md, reading-progress.md, reading-records.md, save-as-markdown.md, search.md, settings-reference.md, sync-and-devices.md
- **Issues:** library-dashboards.md uses "field" and "key" for the same thing ("Fields are named by their keys"), and "property" elsewhere ("a `source` property", read-in-orbis-reader.md; "frontmatter properties", reading-records.md).
- **Approved term:** property
- **Notes:** Original decision: Obsidian refers to them as "properties" <https://obsidian.md/help/properties>  We change the name of what is called "Fields" to Properties (e.g., Fields - Match library fields to the fields in your own notes. becomes Properties
  Match library properties to the properties in your own notes.).  And also change "custom fields" to "custom properties" (see custom fields entry above).
- **Revision (Oct 14):** The Fields page becomes Properties, and "field" becomes "property" in prose. Use "frontmatter" only where the guide shows the raw YAML block.

### fold

- **Status:** Decided
- **Variants:** collapsed section (3)
- **Definition:** A collapsed part of an export dialog, such as Location or Note content, whose header says what is inside.
- **Files:** generate-notes.md, notes-to-epub.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md
- **Issues:** "fold" and "collapsed section" alternate in generate-notes.md and notes-to-epub.md, and save-as-markdown.md says "The Location section".
- **Approved term:** collapsed section
- **Notes:**

### full-screen audio player

- **Status:** Decided
- **Variants:** full-screen player (7); full screen audio player (3)
- **Definition:** The full-screen "now playing" view with cover, title, track, progress bar, transport and actions.
- **Files:** annotations-and-presets.md, command-reference.md, getting-started.md, listening.md, marks-and-notes.md, read-in-orbis-reader.md, settings-reference.md
- **Issues:** Unhyphenated "full screen audio player" in annotations-and-presets.md and settings-reference.md; also "the player" and "now playing" view.
- **Approved term:** full-screen audio player
- **Notes:**

### Go to bar

- **Status:** Decided
- **Variants:** Go to location bar (1)
- **Definition:** The bar under the toolbar that jumps to a location number or a percentage of the book.
- **Files:** reading-a-book.md, troubleshooting.md
- **Issues:** "Go to bar" (reading-a-book.md), "Go to location bar" (troubleshooting.md), "Go to" (listening.md); the command is **Go to location**.
- **Approved term:** Go to bar
- **Notes:**

### highlight

- **Status:** Decided
- **Variants:** None
- **Definition:** Text drawn over with color in the reader.
- **Files:** README.md, command-reference.md, getting-started.md, exporting-and-converting.md, listening.md, notes-to-epub.md, read-in-orbis-reader.md, reading-a-book.md, reading-records.md, save-as-markdown.md, save-as-pdf.md, search.md, troubleshooting.md
- **Issues:** "highlight" names several different things: a passage selection (README.md, troubleshooting.md), the sentence highlighted while listening (listening.md, **Highlight while reading**), search highlights (search.md), the current chapter in the Contents tab (reading-a-book.md), and the highlighter fill (marks-and-notes.md).
- **Approved term:** highlight
- **Notes:** Original decision: use "highlight" when referring to text that is highlighted when listening or a search result.  When referring to applying a mark to text then it is a mark which is made up of either a highlighter, a treatment (underline, etc.), or a combination of both with specific colors selected.
- **Revision (Oct 14):** Use only for text highlighted during listening and for search results. Applying a mark to text is "mark".

### highlighter

- **Status:** Decided
- **Variants:** highlight color (1); wash (1)
- **Definition:** The filled background of a mark's appearance.
- **Files:** annotations-and-presets.md, marks-and-notes.md, save-as-pdf.md
- **Issues:** "wash" in save-as-pdf.md ("the wash behind the words"); "highlight color" in marks-and-notes.md ("Two marks can share a highlight color").
- **Approved term:** highlighter
- **Notes:**

### image viewer

- **Status:** Consistent
- **Variants:** None
- **Definition:** The view an image opens in over the page, where you can zoom, pan or copy it.
- **Files:** format-support.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### inactive

- **Status:** Consistent
- **Variants:** None
- **Definition:** A preset kept out of the list you choose from when assigning a preset, which still works wherever it is used.
- **Files:** annotations-and-presets.md, listening.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### jump

- **Status:** Consistent
- **Variants:** None
- **Definition:** Navigating to another place in the book, such as a chapter, footnote, search result or bookmark, rather than turning a page.
- **Files:** command-reference.md, display-settings.md, getting-started.md, listening.md, reading-a-book.md, save-as-markdown.md, search.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### legend

- **Status:** Consistent
- **Variants:** None
- **Definition:** The part of a PDF explaining what each mark means.
- **Files:** annotations-and-presets.md, save-annotations-as-pdf.md, save-as-pdf.md, settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### listening bar

- **Status:** Decided
- **Variants:** read-along bar (2); Listen bar (1); listen toolbar (1); listening toolbar (1)
- **Definition:** The bar between the toolbar and the page with basic listening controls: headphones, voice chip, skip, play and speed.
- **Files:** command-reference.md, listening.md, reading-a-book.md, settings-reference.md
- **Issues:** "Listen bar" and "listening toolbar" in reading-a-book.md; "listen toolbar" in the command **Toggle listen toolbar**; "read-along bar" in command-reference.md.
- **Approved term:** listening bar
- **Notes:**

### live voice

- **Status:** Consistent
- **Variants:** None
- **Definition:** The voice that reads aloud as you go, without recording anything first; chosen per device.
- **Files:** listening.md, look-up.md, settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### location

- **Status:** Decided
- **Variants:** location number (4)
- **Definition:** A position number Orbis calculates for a book; it does not match the printed book's page numbers.
- **Files:** README.md, book-sources.md, command-reference.md, display-settings.md, generate-notes.md, getting-started.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** **Location** is also the fold in the export dialogs that sets where the file goes (generate-notes.md, save-as-markdown.md, notes-to-epub.md) and the Reading record settings choice of folder (reading-records.md).
- **Approved term:** location
- **Notes:**
- **Revision (Oct 14):** The Location section in the export dialogs is renamed Save to, so "location" keeps one meaning.

### location index

- **Status:** Consistent
- **Variants:** None
- **Definition:** The table of locations for a book, built in the background the first time it opens and saved for later.
- **Files:** command-reference.md, reading-a-book.md, reading-progress.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### mark

- **Status:** Consistent
- **Variants:** None
- **Definition:** A name with a meaning you assign, such as Key point, with an appearance, a badge and roles; passages and notes wear it.
- **Files:** README.md, annotations-and-presets.md, command-reference.md, display-settings.md, format-support.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, listening.md, look-up.md, marks-and-notes.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Marked up by

- **Status:** Decided
- **Variants:** byline (1)
- **Definition:** An optional name printed on a PDF, set once and shared by Save annotations as PDF and Save as PDF.
- **Files:** save-annotations-as-pdf.md, save-as-pdf.md, settings-reference.md
- **Issues:** save-as-pdf.md calls it "the byline" ("removes the cover sheet and the byline").
- **Approved term:** Marked up by
- **Notes:**
- **Revision (Oct 14):** Exact UI label, so it keeps its capital.

### marks bar

- **Status:** Decided
- **Variants:** highlight bar (5); highlight-color bar (1)
- **Definition:** The bar of marks and actions that appears when you select text: below the toolbar on desktop, a drawer on mobile.
- **Files:** annotations-and-presets.md, command-reference.md, look-up.md, marks-and-notes.md, reading-a-book.md, troubleshooting.md
- **Issues:** troubleshooting.md calls it "highlight bar" and "highlight-color bar"; on mobile it is also "the drawer" (marks-and-notes.md).
- **Approved term:** marks bar
- **Notes:**
- **Revision 2 (Oct 14):** Use "marks bar" on every device. Do not call it a drawer on a phone.

### Marks dialog

- **Status:** Decided
- **Variants:** marks manager (1)
- **Definition:** The dialog titled Marks, with two scopes, This book and Presets, where marks are defined and a book's preset chosen.
- **Files:** command-reference.md, listening.md, settings-reference.md
- **Issues:** Opened by **Annotation marks** (toolbar), **Manage marks** (marks bar), **Manage annotation presets** (settings and command) and **Annotation marks for this book…** (command); settings-reference.md calls it "the marks manager".
- **Approved term:** Marks manager
- **Notes:** Using a term which describes the purpose is better than just calling it a "dialog".   The title of the dialog should also be updated from "Marks" to "Marks manager".
- **Revision (Oct 14):** The dialog title changes from Marks to Marks manager.

### mix

- **Status:** Consistent
- **Variants:** None
- **Definition:** A choice of voice per track, referencing recordings and live voices; it holds no audio of its own.
- **Files:** book-sources.md, listening.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### multi-voice model

- **Status:** Consistent
- **Variants:** None
- **Definition:** A download of about 75 MB bundling many voices, chosen by number.
- **Files:** listening.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### named display style

- **Status:** Decided
- **Variants:** named style (3)
- **Definition:** A display style you create; shared with your other devices when Orbis configuration sharing is on.
- **Files:** display-settings.md, settings-reference.md, sync-and-devices.md
- **Issues:** "named display style" and "named style" alternate in display-settings.md and sync-and-devices.md.
- **Approved term:** named display style
- **Notes:**

### note

- **Status:** Decided
- **Variants:** None
- **Definition:** A passage selected from the book that you have added your own text to, which may also carry a mark.
- **Files:** README.md, annotations-and-presets.md, book-sources.md, command-reference.md, display-settings.md, format-support.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, listening.md, look-up.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** "note" names both an annotation and an Obsidian note in the vault ("title note", "chapter note", "Open note: sample" in look-up.md, "Reading records write a vault note"). The guide qualifies the vault sense only sometimes ("vault note", "Obsidian note").
- **Approved term:** annotation note; note
- **Notes:** If the section is about annotation notes then we should call it that the first time and then shorten to "note" for the remainder of the section.  When talking about markdown documents in the Obsidian vault then we should refer to them as Obsidian notes.
- **Revision (Oct 14):** Write "annotation note" the first time in a section, then "note". For Markdown files in the vault, "Obsidian note" and "vault note" are both allowed.

### note editor

- **Status:** Consistent
- **Variants:** None
- **Definition:** Where a note's text is written and its mark chosen, opened by Add note.
- **Files:** command-reference.md, listening.md, marks-and-notes.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### note icon

- **Status:** Consistent
- **Variants:** None
- **Definition:** A small icon in the margin showing where a note is; selecting it opens the note.
- **Files:** command-reference.md, marks-and-notes.md, settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### note selection

- **Status:** Consistent
- **Variants:** None
- **Definition:** The passage a note is attached to; a search scope and a kind you can include in Save annotations as PDF.
- **Files:** save-annotations-as-pdf.md, search.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### notes file

- **Status:** Decided
- **Variants:** generated notes (1)
- **Definition:** What Generate notes writes: one note for the book, or a folder with a note per chapter.
- **Files:** annotations-and-presets.md, command-reference.md, exporting-and-converting.md, save-as-markdown.md, settings-reference.md
- **Issues:** "notes file" in command-reference.md and exporting-and-converting.md; "generated notes" in annotations-and-presets.md; "the notes you have generated" in generate-notes.md.
- **Approved term:** notes file
- **Notes:** This is somewhat confusing.  The command "generate notes" generates either one Obsidian note or a folder of Obsidian notes that contain all annotations.  However, saying "Generate annotations . . . " doesn't make this clearer.  The user is working through a book and adding bookmarks, passage selections, and notes but the thing they probably want to dump into an Obsidian vault note is their annotation notes.  I'm not sure coming up with a different term for this would make it clearer.  

### notes style

- **Status:** Decided
- **Variants:** note style (1)
- **Definition:** A saved configuration for Generate notes: folder, naming, frontmatter, note content and line templates.
- **Files:** command-reference.md, generate-notes.md, settings-reference.md, sync-and-devices.md
- **Issues:** "note styles" once in settings-reference.md; also shortened to "style", which also names a display style.
- **Approved term:** notes style
- **Notes:**

### Orbis marks

- **Status:** Consistent
- **Variants:** None
- **Definition:** The one preset Orbis ships with, holding Key point, Quote, Question, Definition and Disagree; it cannot be edited, only duplicated.
- **Files:** annotations-and-presets.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Orbis Reader

- **Status:** Decided
- **Variants:** Orbis (269)
- **Definition:** The product name: the Obsidian plugin this guide describes.
- **Files:** (added Oct 14)
- **Issues:** The guide shortens the name to "Orbis" 269 times and uses "Orbis Reader" 52 times.
- **Approved term:** Orbis Reader
- **Notes:**
- **Revision (Oct 14):** Write "Orbis Reader" in prose. Exact UI labels and file names keep their current form (for example .orbis file, Orbis voice, Orbis marks) unless ui-changes.md renames them. See the product-name open question in terminology.md.
- **Revision 2 (Oct 14):** Keep "Orbis" in the UI labels Orbis voice, Orbis marks and Share Orbis configuration in the vault, and in the feature name Orbis configuration sharing. (Changed in the second pass: see Decision status.)

### Orbis voice

- **Status:** Decided
- **Variants:** neural voice (2); on-device voice (2)
- **Definition:** A natural-sounding voice that downloads to your device, about 60 MB, then works offline and sounds the same everywhere.
- **Files:** listening.md
- **Issues:** "on-device voice" in listening.md ("The on-device voices send nothing"); "neural voice" in listening.md; getting-started.md says "natural-sounding \"Orbis voice\"".
- **Approved term:** Orbis voice
- **Notes:**
- **Revision (Oct 14):** Kept as the name of the voice type. See the product-name open question in terminology.md.

### orphaned

- **Status:** Consistent
- **Variants:** None
- **Definition:** A reading record whose annotation is gone but which was kept because you added to it; its orphaned property is true.
- **Files:** reading-records.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Paged mode

- **Status:** Decided
- **Variants:** paginated (2)
- **Definition:** The default reading mode: the book is broken into screen-sized pages you turn.
- **Files:** command-reference.md, display-settings.md, settings-reference.md
- **Issues:** Also "Paged" (reading-a-book.md), "paged-mode" (reading-a-book.md) and "paginated" (settings-reference.md, command-reference.md).
- **Approved term:** Paged mode
- **Notes:**
- **Revision (Oct 14):** Lowercase, to match scrolled mode.
- **Revision 2 (Oct 14):** Paged mode, in sentence case. It is the existing UI option label.

### passage selection

- **Status:** Decided
- **Variants:** passage mark (4)
- **Definition:** A passage selected from the book and assigned a mark; it cannot exist unmarked.
- **Files:** annotations-and-presets.md, command-reference.md, generate-notes.md, exporting-and-converting.md, listening.md, look-up.md, marks-and-notes.md, orbis-file.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, search.md, settings-reference.md, troubleshooting.md
- **Issues:** "highlight" stands for a passage selection in README.md ("highlights, notes, bookmarks"), troubleshooting.md, notes-to-epub.md, read-in-orbis-reader.md, save-as-markdown.md, save-as-pdf.md and reading-records.md, and "passage mark" in the **Go to next passage mark** command and the player's **Passage marks** (listening.md). "highlight" also names other things; see its own entry.
- **Approved term:** passage selection
- **Notes:**

### preset

- **Status:** Decided
- **Variants:** annotation preset (1)
- **Definition:** A set of marks; every book gets one by default, and a book can stop using it and keep the marks as its own.
- **Files:** README.md, annotations-and-presets.md, marks-and-notes.md, search.md, settings-reference.md, sync-and-devices.md
- **Issues:** "annotation preset" in the command and setting **Manage annotation presets** and in sync-and-devices.md; "preset" everywhere else.
- **Approved term:** annotation preset; preset
- **Notes:** Original decision: Annotation preset the first time the term is announced in a section.  After that it can be shortened to preset.
- **Revision (Oct 14):** Write "annotation preset" the first time in a section, then "preset".

### progress indicator

- **Status:** Decided
- **Variants:** readout (5); progress readout (1)
- **Definition:** The readout centered in the toolbar showing where you are; selecting it cycles through the modes you have turned on.
- **Files:** README.md, command-reference.md, getting-started.md, marks-and-notes.md, reading-a-book.md, reading-progress.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** "progress readout" and "readout" in reading-a-book.md and getting-started.md; the toolbar table calls the button **Reading progress**; the setting is **Show reading progress indicator**.
- **Approved term:** progress indicator
- **Notes:**

### pronunciation glossary

- **Status:** Consistent
- **Variants:** None
- **Definition:** Every phonetic respelling you have made, applied in every book; edited in the Glossary dialog.
- **Files:** listening.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**
- **Revision 2 (Oct 14):** The dialog title changes from Glossary to Pronunciation glossary.

### rating

- **Status:** Consistent
- **Variants:** None
- **Definition:** What you thought of a book, 0 to 5 in halves; zero is a rating.
- **Files:** library-dashboards.md, orbis-file.md, reading-a-book.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### reading data

- **Status:** Decided
- **Variants:** data page (1); reading-data view (1)
- **Definition:** The page a .orbis file renders: cover, reading activity, contents, annotations and linked vault notes.
- **Files:** command-reference.md, orbis-file.md, reading-progress.md, sync-and-devices.md
- **Issues:** Opened by **Show reading data**; "reading-data view" in command-reference.md; "the data page" in sync-and-devices.md; orbis-file.md mostly says "page".
- **Approved term:** reading data
- **Notes:**

### reading position

- **Status:** Decided
- **Variants:** reading location (6)
- **Definition:** Where you are in a book, saved automatically as you read, once per device.
- **Files:** command-reference.md, marks-and-notes.md, notes-to-epub.md, read-in-orbis-reader.md, reading-progress.md, settings-reference.md, sync-and-devices.md
- **Issues:** "reading location" in the setting **Share reading location with other devices** and sync-and-devices.md; "reading position" elsewhere; often just "position".
- **Approved term:** reading location
- **Notes:**

### reading record

- **Status:** Consistent
- **Variants:** None
- **Definition:** A vault note for one passage selection, note or bookmark, kept up to date as you read.
- **Files:** README.md, command-reference.md, format-support.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, marks-and-notes.md, orbis-file.md, read-in-orbis-reader.md, reading-records.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### reading speed

- **Status:** Decided
- **Variants:** reading pace (4); Average reading speed (2); Estimated pace (2)
- **Definition:** Your reading speed in words per minute, from your last 15 page samples; needed for time-remaining estimates.
- **Files:** orbis-file.md, reading-progress.md, troubleshooting.md
- **Issues:** "reading pace" and "reading speed" are used interchangeably (reading-progress.md); the Stats tab shows **Estimated pace** and the reading data page **Average reading speed**, which orbis-file.md says are the same figure.
- **Approved term:** reading speed
- **Notes:**
- **Revision 2 (Oct 14):** The UI labels change to match: Reading pace to Reading speed, and Estimated pace to Estimated reading speed. See ui-changes.md.

### reading statistics

- **Status:** Decided
- **Variants:** reading stats (2)
- **Definition:** Live figures for the open book (pace, time remaining, progress and word counts), shown on the Stats tab.
- **Files:** README.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md
- **Issues:** "reading stats" in README.md and reading-a-book.md; "reading statistics" in orbis-file.md and read-in-orbis-reader.md.
- **Approved term:** reading stats
- **Notes:**

### reading status

- **Status:** Consistent
- **Variants:** None
- **Definition:** Where you are with a book: interested, reading, read, abandoned, or a value of your own; stored as reading_status.
- **Files:** library-dashboards.md, reading-progress.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### reading-position file

- **Status:** Decided
- **Variants:** location file (2)
- **Definition:** The per-device file in !orbis-data recording where that device is in a book.
- **Files:** orbis-file.md, sync-and-devices.md
- **Issues:** "location file" in orbis-file.md; "reading-position file" in sync-and-devices.md.
- **Approved term:** reading-location file
- **Notes:**

### recording

- **Status:** Decided
- **Variants:** recorded audio (3); generated audio (1)
- **Definition:** Audio files of a book's tracks that Orbis generates in one voice and stores in your vault, played instead of the live voice.
- **Files:** library-dashboards.md, listening.md, orbis-file.md, settings-reference.md, sync-and-devices.md
- **Issues:** "recorded audio" in orbis-file.md and the **Recorded audio** widget; "generated audio" in library-dashboards.md; the settings page is **Recorded voice**, and format-support.md says "recorded voice" for the feature.
- **Approved term:** recording
- **Notes:**

### respelling

- **Status:** Consistent
- **Variants:** None
- **Definition:** A word spelled the way it should sound, which voices use instead of the word.
- **Files:** listening.md, look-up.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### role

- **Status:** Decided
- **Variants:** Use for (2)
- **Definition:** One of two jobs a mark can hold: the mark new notes get, or the one the full-screen audio player applies.
- **Files:** annotations-and-presets.md
- **Issues:** The concept is "roles" (annotations-and-presets.md, "What a mark is") and its control is labeled **Use for** ("Roles: Use for").
- **Approved term:** role
- **Notes:**

### Saved panel

- **Status:** Decided
- **Variants:** Saved tab (1); saved panel (1)
- **Definition:** The content panel tab listing the current book's bookmarks, passage selections and notes in reading order.
- **Files:** README.md, annotations-and-presets.md, command-reference.md, listening.md, marks-and-notes.md
- **Issues:** marks-and-notes.md heads it "The Saved panel" and README.md says "the Saved panel"; the command is **Open saved panel (bookmarks, highlights & notes)**.
- **Approved term:** Annotations tab
- **Notes:** If we are saying that an annotation is the all encompassing term that includes bookmarks, passage selections, and notes then this panel that shows all these items probably should be the annotations panel.  Which means the label / tooltip needs to be updated also.
- **Revision (Oct 14):** A tab of the Navigator. The Saved label and the Open saved panel command change with it.

### search bar

- **Status:** Decided
- **Variants:** search toolbar (1)
- **Definition:** The bar between the toolbar and the page holding the query field, Advanced search, the result arrows and the count.
- **Files:** command-reference.md, listening.md, reading-a-book.md, search.md, settings-reference.md
- **Issues:** "search toolbar" once, in reading-a-book.md (focus mode).
- **Approved term:** search bar
- **Notes:** In general we're not using "toolbar" every one of these is just a "bar".  

### section

- **Status:** Decided
- **Variants:** None
- **Definition:** One of the files a book is made of, as Continuous scroll and the reader load it.
- **Files:** generate-notes.md, library-dashboards.md, look-up.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, save-as-markdown.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** "section" also names the parts of the Look up popup (look-up.md), the collapsed parts of export dialogs ("A collapsed section", generate-notes.md), and parts of a settings page.
- **Approved term:** section
- **Notes:** I think this word is too general to force one way or the other.  Context is key here.
- **Revision (Oct 14):** Meaning depends on context. No single meaning is forced.

### Single Obsidian note

- **Status:** Decided
- **Variants:** Single note (8); single-file (1)
- **Definition:** The format that puts a whole export in one Markdown file.
- **Files:** generate-notes.md, save-as-markdown.md, settings-reference.md, troubleshooting.md
- **Issues:** "Single note" in generate-notes.md and save-as-markdown.md; "single-file" in troubleshooting.md.
- **Approved term:** Single Obsidian note
- **Notes:**
- **Revision (Oct 14):** Exact UI label.

### speech engine

- **Status:** Decided
- **Variants:** TTS engine (1); recording engine (1)
- **Definition:** What turns text into speech: on the device (Piper) or a speech server (Kokoro), the second for recordings only.
- **Files:** listening.md, settings-reference.md
- **Issues:** "speech engine" (listening.md), "TTS engine" (settings-reference.md), "recording engines" (listening.md).
- **Approved term:** speech engine
- **Notes:**

### speech server

- **Status:** Consistent
- **Variants:** None
- **Definition:** A Kokoro (OpenAI-compatible) server that can generate recorded voices; it receives the text it records.
- **Files:** listening.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### sync tool

- **Status:** Consistent
- **Variants:** None
- **Definition:** The tool that actually moves vault files between devices, such as Obsidian Sync or Syncthing; Orbis only writes the files.
- **Files:** reading-progress.md, reading-records.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### system voice

- **Status:** Consistent
- **Variants:** None
- **Definition:** A voice built into the operating system; no download, but limited choice, and Android has none.
- **Files:** getting-started.md, listening.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### table of contents

- **Status:** Decided
- **Variants:** contents list (2)
- **Definition:** The book's own list of chapters, shown on the Contents tab and in the reading data page.
- **Files:** command-reference.md, format-support.md, exporting-and-converting.md, listening.md, notes-to-epub.md, orbis-file.md, reading-a-book.md, save-as-pdf.md
- **Issues:** Also "the book's contents" (generate-notes.md, save-as-markdown.md) and "contents list" (notes-to-epub.md); the tab is **Contents**.
- **Approved term:** table of contents
- **Notes:**

### theme

- **Status:** Decided
- **Variants:** reader theme (2)
- **Definition:** The background, text and link colors a book is painted with, chosen from the Theme list.
- **Files:** README.md, display-settings.md, getting-started.md, reading-a-book.md, settings-reference.md, sync-and-devices.md
- **Issues:** Bare "theme" names both an Orbis reader theme and an Obsidian theme ("Match Obsidian's theme", "Choose another Obsidian theme", display-settings.md); the control is **Reader theme** on the display toolbar and **Theme** in settings.
- **Approved term:** reader theme
- **Notes:** I think the documentation should refer to it as a "Reader theme".  We probably want to update the labels to use the label "Reader theme" as well to be consistent. So "Theme manager" changes to "Reader theme manager" and "Theme" changes to "Reader theme".
- **Revision (Oct 14):** Lowercase in prose. UI labels change: Theme to Reader theme, Theme manager to Reader theme manager.

### This book

- **Status:** Decided
- **Variants:** book's own mark (5)
- **Definition:** A mark that belongs to one book rather than to its preset, badged This book in the Marks dialog.
- **Files:** annotations-and-presets.md, command-reference.md, reading-progress.md
- **Issues:** The guide says "a mark of the book's own" and "the book's own" in prose and **This book** for the badge and the scope of the Marks dialog.
- **Approved term:** This book
- **Notes:**
- **Revision (Oct 14):** Exact UI label.

### This device

- **Status:** Decided
- **Variants:** device style (2)
- **Definition:** The display style every device starts with, only on that device; it cannot be renamed, deleted or shared.
- **Files:** display-settings.md, sync-and-devices.md
- **Issues:** display-settings.md heads it "This device's own style" and lists it as **This device** (or the device's name with "(this device)"); sync-and-devices.md calls it "device style". **This device** is also the Setup choice "This device (Piper)" in listening.md.
- **Approved term:** This device
- **Notes:**
- **Revision (Oct 14):** Exact UI label.

### title

- **Status:** Decided
- **Variants:** None
- **Definition:** An item in the Library: an ebook file in the vault or any other book you own, each described by a title note.
- **Files:** book-sources.md, display-settings.md, format-support.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, listening.md, notes-to-epub.md, orbis-file.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, settings-reference.md
- **Issues:** "title" means both a library item ("any other title you own") and a book's title (the `title` field, "Title, authors, publisher…").
- **Approved term:** title
- **Notes:** Original decision: Title should be the name of a book.  A title note should be what the library reads.
- **Revision (Oct 14):** Two meanings are allowed: the name of a book, and an item in the library. A library item does not have to be a book (for example, a DVD). A title note is the note that describes a title. The Titles, All titles, Random title and How many titles labels do not change.

### title note

- **Status:** Consistent
- **Variants:** None
- **Definition:** An Obsidian note describing one title, whose frontmatter has orbis_note: title and a title.
- **Files:** README.md, book-sources.md, format-support.md, getting-started.md, library-dashboards.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### toolbar

- **Status:** Decided
- **Variants:** None
- **Definition:** The row of buttons at the top of the reader.
- **Files:** README.md, command-reference.md, display-settings.md, getting-started.md, listening.md, marks-and-notes.md, reading-a-book.md, reading-progress.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** "toolbar" also names the bars under it: "search toolbar", "listening toolbar" (reading-a-book.md), the command **Toggle listen toolbar**, "display style toolbar" (display-settings.md); and Android's selection toolbar (troubleshooting.md). The main one is also "the Orbis toolbar" and "the reader toolbar".
- **Approved term:** toolbar
- **Notes:** Original decision: toolbar is the top level entity with the main set of buttons.  Each specific bar underneath is a "bar".  So it would be Toggle listening bar or the Display styles bar.
- **Revision (Oct 14):** Only the main row of buttons at the top of the reader. Each row under it is a bar: search bar, listening bar, display style bar, Go to bar.

### track

- **Status:** Decided
- **Variants:** None
- **Definition:** What the audio player plays: usually a chapter, divided when long, or one of the book's files when it has no contents.
- **Files:** annotations-and-presets.md, book-sources.md, format-support.md, library-dashboards.md, listening.md, marks-and-notes.md, reading-progress.md
- **Issues:** getting-started.md and command-reference.md call ⏮ and ⏭ "chapter skip", and listening.md says the bar has no "chapter buttons"; listening.md defines them as previous and next track.
- **Approved term:** track
- **Notes:** The documentation describes this.  A track is typically a chapter but not always.  Within the audio player the units you navigate between are tracks.

### trash

- **Status:** Decided
- **Variants:** trashcan (1)
- **Definition:** Where deleted files go, as Obsidian's Deleted files setting says.
- **Files:** annotations-and-presets.md, book-sources.md, display-settings.md, listening.md, marks-and-notes.md, orbis-file.md, reading-records.md, settings-reference.md, troubleshooting.md
- **Issues:** "trash" is both the place deleted files go (orbis-file.md, reading-records.md) and a delete button ("the trash beside a voice", listening.md; "a trash", book-sources.md), once "trashcan icon" (marks-and-notes.md).
- **Approved term:** trash
- **Notes:** Original decision: trash is where files go when they're deleted.  The icon is called the "trashcan icon".  The distinction is there to be more precise.
- **Revision (Oct 14):** "trash" is where Obsidian puts deleted files. The delete control is the "trashcan button" (rule: "button" for anything the user selects, "icon" only for the picture on it).

### treatment

- **Status:** Consistent
- **Variants:** None
- **Definition:** The shape part of a mark's appearance: Underline, Double underline, Squiggle, Strikethrough or Box.
- **Files:** annotations-and-presets.md, exporting-and-converting.md, marks-and-notes.md, save-annotations-as-pdf.md, save-as-pdf.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### two-column layout

- **Status:** Decided
- **Variants:** column layout (3); double-column layout (1)
- **Definition:** Showing each page in two columns when the reading area is wide enough; available in Paged mode only.
- **Files:** command-reference.md, display-settings.md, reading-a-book.md, settings-reference.md
- **Issues:** "column layout" in reading-a-book.md and the command **Toggle column layout**; "double-column layout" in command-reference.md; the control is **Two-column layout**.
- **Approved term:** two-column layout
- **Notes:**

### uncataloged

- **Status:** Consistent
- **Variants:** None
- **Definition:** A book in the vault that no title note links to.
- **Files:** library-dashboards.md, settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### unmarked note

- **Status:** Decided
- **Variants:** None
- **Definition:** A note saved without a mark; only notes can be unmarked.
- **Files:** generate-notes.md, marks-and-notes.md, save-annotations-as-pdf.md, search.md
- **Issues:** The note editor's choice is **Unmarked** (marks-and-notes.md) but the command is **Apply no mark (note editor)** (command-reference.md); filters say **Unmarked notes**, and marks-and-notes.md says that is "rather than 'no mark'".
- **Approved term:** unmarked note
- **Notes:**

### Use this vault on more than one device

- **Status:** Decided
- **Variants:** master switch (1)
- **Definition:** The per-device switch for using one vault on several devices; the rest of the Devices page is hidden until it is on.
- **Files:** settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** settings-reference.md calls the setting "The master switch".
- **Approved term:** Use this vault on more than one device
- **Notes:** Calling it "The master switch" is describing its purpose.  This toggle is the one switch that enables and disables the whole feature.  It is descriptive of what it does.
- **Revision (Oct 14):** Refer to the switch by its label only. Remove "master switch" from the guide.

### voice chip

- **Status:** Consistent
- **Variants:** None
- **Definition:** The pill on the listening bar and player showing the current voice; selecting it opens Voice and source.
- **Files:** listening.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### widget

- **Status:** Consistent
- **Variants:** None
- **Definition:** One part of a dashboard, showing one collection in one way.
- **Files:** README.md, getting-started.md, library-dashboards.md, reading-progress.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### ⋯ menu

- **Status:** Decided
- **Variants:** pane menu (6)
- **Definition:** The reader pane's ⋯ menu, holding commands that act on the whole book.
- **Files:** generate-notes.md, exporting-and-converting.md, library-dashboards.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, troubleshooting.md
- **Issues:** Also "the ⋯ menu", "the pane's own ⋯ menu", "`⋯` pane menu" and "the reader's ⋯ menu".
- **Approved term:** ⋯ menu
- **Notes:**

## Features

### Advanced search

- **Status:** Consistent
- **Variants:** None
- **Definition:** The search options behind the sliders button: scopes, a mark filter and match options.
- **Files:** search.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Book sources

- **Status:** Consistent
- **Variants:** None
- **Definition:** Connects Orbis to online OPDS feeds to browse, search and download books into a vault folder; off until turned on, per device.
- **Files:** README.md, book-sources.md, format-support.md, getting-started.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### feed

- **Status:** Decided
- **Variants:** source (39); book source (37); OPDS feed (24)
- **Definition:** An online catalog of books in the OPDS format, added under Book sources; Project Gutenberg is provided.
- **Files:** README.md, book-sources.md, format-support.md, getting-started.md, listening.md, look-up.md, notes-to-epub.md, read-in-orbis-reader.md, save-as-markdown.md, settings-reference.md, sync-and-devices.md
- **Issues:** book-sources.md uses "feed", "OPDS feed", "source" and "book source" for the same thing ("Add a source" adds a feed; "Search this source"); it says messages say "source" on purpose. Counts of "source" and "feed" include other uses.
- **Approved term:** OPDS feed; feed
- **Notes:** Original decision: OPDS feed should be used the first time referring to this in a section.  Within the same section using feed by itself is enough because we've already said what we're talking about.
- **Revision (Oct 14):** Write "OPDS feed" the first time in a section, then "feed". The UI labels Add a source, Search this source and Browse book sources do not change, because other kinds of source may be added later.

### Filter by mark

- **Status:** Decided
- **Variants:** mark filter (3)
- **Definition:** The Advanced search option that limits results to passage selections and notes with the marks you select.
- **Files:** search.md
- **Issues:** Split from Marks to include, which is the export-dialog term.
- **Approved term:** Filter by mark
- **Notes:**

### flash

- **Status:** Consistent
- **Variants:** None
- **Definition:** A brief pulse on the passage you land on after a jump or search, controlled by Flash book text for navigation and search results.
- **Files:** listening.md, marks-and-notes.md, reading-a-book.md, search.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### focus mode

- **Status:** Decided
- **Variants:** full-screen reading (2)
- **Definition:** Hides the Orbis toolbar; on a phone or tablet it also hides Obsidian's bars so the book fills the screen.
- **Files:** README.md, command-reference.md, display-settings.md, getting-started.md, listening.md, reading-a-book.md, search.md, settings-reference.md, troubleshooting.md
- **Issues:** "full-screen reading" in getting-started.md and reading-a-book.md; **Focus mode** is also the toolbar button and a **How the book opens** choice.
- **Approved term:** Focus mode
- **Notes:**
- **Revision (Oct 14):** Feature names use sentence case.

### Generate notes

- **Status:** Consistent
- **Variants:** None
- **Definition:** Writes a book's passage selections, notes and bookmarks as Obsidian notes, one note or a book folder, using a notes style.
- **Files:** README.md, annotations-and-presets.md, command-reference.md, format-support.md, generate-notes.md, exporting-and-converting.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, reading-a-book.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, settings-reference.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Library

- **Status:** Decided
- **Variants:** Library dashboards (19)
- **Definition:** A catalog of everything you keep track of: ebook files in the vault and any other title you own, each a note.
- **Files:** README.md, book-sources.md, format-support.md, getting-started.md, library-dashboards.md, look-up.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-progress.md, settings-reference.md, sync-and-devices.md
- **Issues:** The feature is "the Library" and its settings page and guide page are **Library dashboards**; "library" also means a Calibre library or a Project Gutenberg library (book-sources.md, look-up.md); and **Library** is also the provided dashboard.
- **Approved term:** Library dashboards; library; Library; Library view
- **Notes:** Original decision: Context is important here.  The feature is "Library dashboards"; however, the "library" is the combination of all title notes in the Obsidian vault.  
- **Revision (Oct 14):** Library dashboards is the feature. "library" (lowercase) is all the title notes in the vault. "Library" (capitalized) is the default dashboard that Orbis Reader provides.
- **Revision 2 (Oct 14):** The view that the ribbon icon and Open the library open is the "Library view". It shows the current dashboard.

### Link preview

- **Status:** Consistent
- **Variants:** None
- **Definition:** With it on, selecting a link in a book shows its destination in a popup first.
- **Files:** command-reference.md, reading-a-book.md, save-as-markdown.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Listening

- **Status:** Decided
- **Variants:** read aloud (8); narration (2)
- **Definition:** Orbis reading your book aloud, following along with a highlight and turning pages as it goes.
- **Files:** README.md, annotations-and-presets.md, command-reference.md, format-support.md, getting-started.md, listening.md, look-up.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, settings-reference.md, sync-and-devices.md
- **Issues:** The guide page is "Listening (Read Aloud)"; the toolbar setting is **Read aloud** and the button **Listen**; look-up.md says "narration".
- **Approved term:** Listening
- **Notes:**

### Look up

- **Status:** Decided
- **Variants:** look-up (11); Look-up (2)
- **Definition:** Select text and see offline definitions, matching vault notes and web search buttons in one popup.
- **Files:** README.md, format-support.md, getting-started.md, listening.md, look-up.md, marks-and-notes.md, search.md, settings-reference.md, sync-and-devices.md
- **Issues:** The action and page title are "Look up"; the settings page and Setup task are **Look-up**; prose says "look-up" ("look-up popup", "offline dictionaries for look-up"); look-up.md heads a section "The Look Up popup".
- **Approved term:** Look-up
- **Notes:**
- **Revision (Oct 14):** Look-up is the feature and the settings page. The marks bar button keeps its label Look up, which is a verb.

### Marks to include

- **Status:** Decided
- **Variants:** mark filter (3); Filter by mark (2)
- **Definition:** Limits search results or an export to items carrying the marks you choose.
- **Files:** generate-notes.md, exporting-and-converting.md, save-annotations-as-pdf.md, save-as-pdf.md, search.md
- **Issues:** **Filter by mark** in Advanced search, **Marks to include** in the export dialogs, "Select marks" and "the mark picker" (search.md).
- **Approved term:** Marks to include
- **Notes:** Original decision: Depends on the context.  In the Generate notes dialog it says "Marks to include" which makes sense for that context -- what marks do you want to be part of the notes you are generating.  In the context of advanced search you're not including you are filtering so "filter by mark" makes more sense there.  Seems like we need two different terms.
- **Revision (Oct 14):** Used in the Generate notes and export dialogs only. Advanced search uses Filter by mark (separate entry below).

### Notes to EPUB

- **Status:** Decided
- **Variants:** Save as EPUB (4); notes to EPUB (1)
- **Definition:** Converts Obsidian notes into EPUB books: one note, a folder as one book, or a book per note.
- **Files:** README.md, format-support.md, exporting-and-converting.md, notes-to-epub.md, read-in-orbis-reader.md, save-as-markdown.md, settings-reference.md, sync-and-devices.md
- **Issues:** The guide page is "Notes to EPUB", but exporting-and-converting.md links to it as "Save as EPUB", which is also the settings page; the commands are **Save note as EPUB…**, **Save folder as EPUB…** and **Save folder notes as EPUBs…**.
- **Approved term:** Notes to EPUB
- **Notes:** Original decision: There's some nuance here.  The feature that takes Obsidian notes and changes them into EPUBs is called "Notes to EPUB" because you're taking one Obsidian note or a folder of Obsidian notes and turning them into EPUBs.  The specific commands that are used in different cases each have their own names.
- **Revision (Oct 14):** Notes to EPUB is the feature. Each command keeps its own name.

### offline dictionary

- **Status:** Consistent
- **Variants:** None
- **Definition:** One of two downloadable dictionaries, Webster's 1913 or WordNet 2025, about 21 MB each, that give Look up its definitions.
- **Files:** README.md, getting-started.md, look-up.md, settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Orbis configuration sharing

- **Status:** Decided
- **Variants:** Share Orbis configuration in the vault (7); Orbis data sharing (1)
- **Definition:** Writes your presets, dashboards, styles and other vault settings into the vault as files so a sync tool can share them.
- **Files:** annotations-and-presets.md, book-sources.md, display-settings.md, library-dashboards.md, listening.md, settings-reference.md, sync-and-devices.md
- **Issues:** The setting is **Share Orbis configuration in the vault**; the setup toggle is **Orbis configuration**; settings-reference.md's Devices description says "Orbis data sharing"; display-settings.md says "when sync is on".
- **Approved term:** Orbis Reader configuration sharing
- **Notes:**
- **Revision (Oct 14):** See the product-name open question in terminology.md.
- **Revision 3 (Oct 14):** The feature name is Orbis Reader configuration sharing, so it is clear that the setting is about Orbis Reader. The labels change to **Share Orbis Reader configuration in the vault** and **Orbis Reader configuration**. "config" becomes "configuration" (**Vault folder for configuration files**).

### pocket mode

- **Status:** Decided
- **Variants:** pocket listening (1)
- **Definition:** Locking the full-screen player's on-screen controls so a stray touch cannot stop or skip the audio.
- **Files:** README.md, command-reference.md, getting-started.md, listening.md
- **Issues:** "pocket listening" in command-reference.md; the command is **Lock listening controls**.
- **Approved term:** Pocket mode
- **Notes:**
- **Revision (Oct 14):** Feature names use sentence case.

### Read in Orbis Reader

- **Status:** Consistent
- **Variants:** None
- **Definition:** Turns a note into a book and opens it in one step, without asking anything.
- **Files:** README.md, command-reference.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Reading records

- **Status:** Consistent
- **Variants:** None
- **Definition:** Writes a vault note for every passage selection, note and bookmark you save, as you save it, with Obsidian Bases beside them.
- **Files:** README.md, format-support.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, marks-and-notes.md, orbis-file.md, read-in-orbis-reader.md, reading-records.md, settings-reference.md, sync-and-devices.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Save annotations as PDF

- **Status:** Decided
- **Variants:** None
- **Definition:** Writes a digest of your passage selections and notes as a PDF; unavailable until the book has one.
- **Files:** README.md, command-reference.md, generate-notes.md, exporting-and-converting.md, reading-a-book.md, save-annotations-as-pdf.md, save-as-pdf.md, settings-reference.md, troubleshooting.md
- **Issues:** sync-and-devices.md lists "Marks → PDF" among the export defaults, a name no other guide page uses.
- **Approved term:** Save annotations as PDF
- **Notes:**

### Save as Markdown

- **Status:** Decided
- **Variants:** Book Export (2); book export (1)
- **Definition:** Converts the book's own text into Markdown notes in the vault: one note, or a folder with one per chapter.
- **Files:** README.md, command-reference.md, format-support.md, generate-notes.md, exporting-and-converting.md, notes-to-epub.md, reading-a-book.md, save-as-markdown.md, save-as-pdf.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** notes-to-epub.md links to it as "Book Export"; sync-and-devices.md says "book export".
- **Approved term:** Save as Markdown
- **Notes:**

### Save as PDF

- **Status:** Consistent
- **Variants:** None
- **Definition:** Converts the book into a PDF with your marks drawn where you made them and your notes as comments.
- **Files:** README.md, annotations-and-presets.md, command-reference.md, format-support.md, generate-notes.md, getting-started.md, exporting-and-converting.md, marks-and-notes.md, reading-a-book.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, settings-reference.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### scope

- **Status:** Decided
- **Variants:** None
- **Definition:** What a search looks through: Book text, Passage selections, Note selections or Note text.
- **Files:** annotations-and-presets.md, search.md
- **Issues:** "scope" also names the two halves of the Marks dialog, **This book** and **Presets** (annotations-and-presets.md).
- **Approved term:** scope
- **Notes:** This term is too general to use it in one context and not in the other.  In the context of Annotations the scope of a given mark is "this book" or "preset".  In the context of search, it has to do with what areas you're searching through.  Both are valid.
- **Revision (Oct 14):** Meaning depends on context: a mark's scope (This book or Presets) or a search scope.

### Search

- **Status:** Consistent
- **Variants:** None
- **Definition:** Full-text search of the open book and, if you choose, your passage selections and notes.
- **Files:** README.md, book-sources.md, command-reference.md, format-support.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, listening.md, look-up.md, marks-and-notes.md, reading-a-book.md, reading-records.md, save-as-markdown.md, search.md, settings-reference.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Setup

- **Status:** Decided
- **Variants:** None
- **Definition:** The settings page for turning capabilities on, one task each, with a count of how many are done.
- **Files:** book-sources.md, getting-started.md, library-dashboards.md, look-up.md, save-as-pdf.md, settings-reference.md, sync-and-devices.md
- **Issues:** "setup" also names the multi-device setup dialog (sync-and-devices.md, "The setup dialog") and the **Set up** button on each task.
- **Approved term:** Setup
- **Notes:** Setup is the Top level setting which takes the user through enabling Orbis features.  In other contexts we should use the more precise language.  However, setup is also what you do.  I'm going to setup Reading records or library dashboards.
- **Revision (Oct 14):** "Setup" is the noun (the settings page). The verb is two words: "set up".

### Share reading location with other devices

- **Status:** Consistent
- **Variants:** None
- **Definition:** Lets each device read the others' location files, so a book can offer another device's position.
- **Files:** settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### web destination

- **Status:** Decided
- **Variants:** search destination (3)
- **Definition:** A web site Look up offers as a button, from an address containing {{query}}; some are built in and you can add your own.
- **Files:** look-up.md, settings-reference.md, sync-and-devices.md
- **Issues:** "web destination" in look-up.md and sync-and-devices.md; "search destination" for the setting **Search destinations**.
- **Approved term:** search destination
- **Notes:**

## Action verbs

### choose

- **Status:** Decided
- **Variants:** None
- **Definition:** Used for picking an option or a menu item, such as choose Look up from the marks bar.
- **Files:** annotations-and-presets.md, book-sources.md, command-reference.md, display-settings.md, generate-notes.md, exporting-and-converting.md, library-dashboards.md, listening.md, look-up.md, marks-and-notes.md, read-in-orbis-reader.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, save-as-pdf.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** Overlaps with "select" and "pick" for menu items and options ("choose **Look up** from the marks bar", look-up.md; "Select a mark", marks-and-notes.md).
- **Approved term:** select
- **Notes:** Context is important here.  The user chooses certain things.  However, they "select" a button or option.
- **Revision (Oct 14):** Use "select" for buttons and options. Use "choose" only for a decision that is not a UI action.

### click

- **Status:** Consistent
- **Variants:** None
- **Definition:** Used only beside "tap" or "long-press", where a gesture differs by device, such as click and drag.
- **Files:** marks-and-notes.md, reading-a-book.md
- **Issues:** Covered by an existing vocabulary rule; see [Existing vocabulary rules](#existing-vocabulary-rules).
- **Approved term:**
- **Notes:**

### drag

- **Status:** Consistent
- **Variants:** None
- **Definition:** Moving something with the pointer or a finger held down: a slider, a list row, a selection handle or a zoomed image.
- **Files:** annotations-and-presets.md, display-settings.md, listening.md, marks-and-notes.md, reading-a-book.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### enable

- **Status:** Decided
- **Variants:** switch on (18); turn on (17); toggle on (2)
- **Definition:** Making a setting or feature active.
- **Files:** annotations-and-presets.md, book-sources.md, command-reference.md, display-settings.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, listening.md, look-up.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-progress.md, reading-records.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** All four appear for switches, sometimes in one page (book-sources.md: "turn it on", "switch Book sources on", "Enabling book sources", "toggle Book sources back on").
- **Approved term:** enable
- **Notes:**
- **Revision 2 (Oct 14):** UI labels change to match: Turn on book sources becomes Enable book sources, Show the library becomes Enable the library, and Switched off becomes Disabled.

### long-press

- **Status:** Decided
- **Variants:** long press (1); press and hold (1)
- **Definition:** Holding a finger on a touch screen to open a menu or select text.
- **Files:** command-reference.md, exporting-and-converting.md, library-dashboards.md, marks-and-notes.md, notes-to-epub.md, read-in-orbis-reader.md
- **Issues:** "long press" (library-dashboards.md) and "press and hold" (marks-and-notes.md) beside "long-press".
- **Approved term:** long-press
- **Notes:**

### pick

- **Status:** Decided
- **Variants:** None
- **Definition:** Used for choosing among options, such as pick a voice.
- **Files:** annotations-and-presets.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, listening.md, notes-to-epub.md, orbis-file.md, reading-progress.md, search.md, sync-and-devices.md, troubleshooting.md
- **Issues:** Overlaps with "choose" and "select" ("pick it from the reader's ⋯ menu", reading-progress.md).
- **Approved term:** select
- **Notes:**

### pinch

- **Status:** Consistent
- **Variants:** None
- **Definition:** Zooming an image with two fingers, or a trackpad pinch.
- **Files:** format-support.md, reading-a-book.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### point at it

- **Status:** Decided
- **Variants:** hover (2); pointing at (2)
- **Definition:** Resting the pointer on a control to see its tooltip.
- **Files:** library-dashboards.md, listening.md, save-as-markdown.md, settings-reference.md
- **Issues:** "hover" in settings-reference.md; "point at" in listening.md and save-as-markdown.md.
- **Approved term:** hover
- **Notes:**

### press

- **Status:** Decided
- **Variants:** None
- **Definition:** Used for keys (press Enter) and, in places, for on-screen buttons.
- **Files:** annotations-and-presets.md, book-sources.md, command-reference.md, getting-started.md, library-dashboards.md, look-up.md, marks-and-notes.md, reading-a-book.md, search.md, settings-reference.md, sync-and-devices.md
- **Issues:** "press" is used for on-screen buttons where "select" is the rule: "press ▶" (getting-started.md), "Press the magnifying glass" (search.md, which also says "Select the toolbar's magnifying glass"), "press Duplicate" (annotations-and-presets.md), "press Make a copy" (library-dashboards.md), "press Set up" (book-sources.md).
- **Approved term:** press (keys only)
- **Notes:** When keyboard keys are involved then "press" is correct as in "press ENTER".  However, when icons or UX elements are involved then it is "select"
- **Revision (Oct 14):** "press" only for keyboard keys (press Enter). Use "select" for buttons and other UI elements.

### right-click

- **Status:** Consistent
- **Variants:** None
- **Definition:** Opening a context menu with the mouse, always paired with long-press for touch screens.
- **Files:** command-reference.md, exporting-and-converting.md, library-dashboards.md, notes-to-epub.md, read-in-orbis-reader.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### run

- **Status:** Decided
- **Variants:** trigger (10); invoke (1)
- **Definition:** Carrying out a command from the command palette.
- **Files:** book-sources.md, command-reference.md, display-settings.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, listening.md, look-up.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** "trigger" for commands in reading-a-book.md ("trigger Toggle focus mode") and for buttons and searches elsewhere; "invoke" in settings-reference.md. The count of "run" includes other uses.
- **Approved term:** run
- **Notes:**

### select

- **Status:** Decided
- **Variants:** None
- **Definition:** The guide's verb for activating any control on any device, and for selecting text in the book.
- **Files:** annotations-and-presets.md, book-sources.md, command-reference.md, display-settings.md, format-support.md, generate-notes.md, getting-started.md, library-dashboards.md, listening.md, look-up.md, marks-and-notes.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-progress.md, reading-records.md, save-as-markdown.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** "select" both activates a control ("Select ▶ to start") and selects text ("Select text in the book"). It competes with "press", "choose" and "pick" for buttons and menu items.
- **Approved term:** select
- **Notes:** Select is a very general term.  There are two contexts that it can be used.  When I'm in a book and I need to apply a mark or look-up something the first step is to "select" text.  Using another term for choosing text is just going to make things less clear.  Second, if I am interacting with a UX element then "select" is a general team which is inclusive of "tapping" or "touching" on a mobile device or "clicking" using a mouse on a Desktop computer.  Both contexts are clear enough.

### swipe

- **Status:** Consistent
- **Variants:** None
- **Definition:** Moving a finger across a touch screen to turn a page or open the command palette.
- **Files:** getting-started.md, listening.md, reading-a-book.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### switch off

- **Status:** Decided
- **Variants:** turn off (8); disable (7); toggle off (3)
- **Definition:** Making a setting or feature inactive.
- **Files:** annotations-and-presets.md, book-sources.md, command-reference.md, generate-notes.md, getting-started.md, listening.md, look-up.md, orbis-file.md, reading-a-book.md, reading-progress.md, reading-records.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** Mirrors **turn on**: "switch it off", "disable", "toggled off" and "turn it off" for the same switches.
- **Approved term:** disable
- **Notes:** Original decision: Disable would be the parallel to "enable"

### tap

- **Status:** Consistent
- **Variants:** None
- **Definition:** Used only beside "click", where a gesture differs by device, such as double-tap or double-click.
- **Files:** reading-a-book.md
- **Issues:** Covered by an existing vocabulary rule; see [Existing vocabulary rules](#existing-vocabulary-rules).
- **Approved term:**
- **Notes:**

### untick

- **Status:** Decided
- **Variants:** uncheck (1)
- **Definition:** Turning off a checkbox, such as a chapter in an export; tick turns one on.
- **Files:** generate-notes.md, notes-to-epub.md, save-annotations-as-pdf.md, save-as-markdown.md, sync-and-devices.md
- **Issues:** "Include images was unchecked" (troubleshooting.md) and "before you uncheck it" (generate-notes.md) beside "tick" and "untick".
- **Approved term:** uncheck
- **Notes:**
- **Revision (Oct 14):** The opposite is "check".

## External terms

### AZW3

- **Status:** Decided
- **Variants:** Kindle Format 8 (2)
- **Definition:** The newer Amazon Kindle format, .azw3.
- **Files:** format-support.md, save-as-markdown.md
- **Issues:** "Kindle Format 8" in format-support.md, "AZW3" elsewhere.
- **Approved term:** AZW3
- **Notes:** We have a section in the guide where formats are defined where we say AZW3 is "The newer Amazon Kindle format" or whatever.
- **Revision (Oct 14):** Defined in format-support.md.

### base

- **Status:** Decided
- **Variants:** Base (7); Obsidian Bases (2)
- **Definition:** Obsidian's database views that group, sort and filter notes; reading records and book folders come with one.
- **Files:** generate-notes.md, library-dashboards.md, reading-records.md, save-as-markdown.md, settings-reference.md
- **Issues:** "Obsidian Bases", "Bases", "an Obsidian Base block", "a Base" and "Obsidian base" (lowercase, reading-records.md) and "base" (reading-records.md) appear for the same thing.
- **Approved term:** Obsidian base; base
- **Notes:** Original decision: Obsidian base the first time we refer to it within a section.  To keep things lean we can say "base" or "bases" when referring to it in the rest of a given section.
- **Revision (Oct 14):** Write "Obsidian base" the first time in a section, then "base".

### BRAT

- **Status:** Consistent
- **Variants:** None
- **Definition:** Beta Reviewers Auto-update Tester, a community plugin that installs other plugins from their repository and keeps them updated.
- **Files:** getting-started.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Calibre server

- **Status:** Decided
- **Variants:** Calibre content server (2)
- **Definition:** Calibre's own server, whose OPDS address lets you browse your Calibre library from Book sources.
- **Files:** README.md, book-sources.md
- **Issues:** "Calibre content server" and "Calibre server" alternate in book-sources.md; README.md says "your own Calibre server".
- **Approved term:** Calibre server
- **Notes:**

### CBZ

- **Status:** Decided
- **Variants:** Comic Book Archive (2); comic archive (2)
- **Definition:** A zip of images, such as comics or scanned books: read and tracked, but with no text to select, search or hear.
- **Files:** format-support.md, troubleshooting.md
- **Issues:** "Comic Book Archive" and "comic archive" in format-support.md and troubleshooting.md.
- **Approved term:** CBZ
- **Notes:** See notes on AZW3
- **Revision (Oct 14):** Defined in format-support.md.

### CFI

- **Status:** Consistent
- **Variants:** None
- **Definition:** Canonical Fragment Identifier: the precise location in a book that deep links and annotations are anchored with.
- **Files:** orbis-file.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### command palette

- **Status:** Decided
- **Variants:** palette (16)
- **Definition:** Obsidian's searchable list of commands, opened with Ctrl/Cmd+P.
- **Files:** README.md, annotations-and-presets.md, book-sources.md, command-reference.md, display-settings.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, listening.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** Shortened to "palette" (reading-a-book.md, library-dashboards.md) and "the Obsidian palette" once (reading-a-book.md).
- **Approved term:** command palette; palette
- **Notes:** Original decision: In a given section we should say "Command palette" the first time we talk about it then shorten to palette when referring back to it in the same section.
- **Revision (Oct 14):** Lowercase. Write "command palette" the first time in a section, then "palette".

### community plugin

- **Status:** Consistent
- **Variants:** None
- **Definition:** A plugin made by someone other than Obsidian's makers, enabled under Settings → Community plugins.
- **Files:** getting-started.md, settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### DRM

- **Status:** Consistent
- **Variants:** None
- **Definition:** Copy protection some stores wrap books in; Orbis cannot open DRM-protected files and will not strip it.
- **Files:** format-support.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### EPUB

- **Status:** Consistent
- **Variants:** None
- **Definition:** The standard ebook format, and the one Orbis prefers when there is a choice.
- **Files:** README.md, book-sources.md, command-reference.md, format-support.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, look-up.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, save-as-markdown.md, save-as-pdf.md, settings-reference.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### FB2

- **Status:** Decided
- **Variants:** FictionBook 2 (2)
- **Definition:** FictionBook 2, an XML book format common in Russian and Eastern European collections.
- **Files:** format-support.md, save-as-markdown.md
- **Issues:** "FictionBook 2" in format-support.md, "FB2" elsewhere.
- **Approved term:** FB2
- **Notes:** See notes on AZW3
- **Revision (Oct 14):** Defined in format-support.md.

### Files pane

- **Status:** Consistent
- **Variants:** None
- **Definition:** Obsidian's file list, where selecting a book opens it in the reader.
- **Files:** settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### frontmatter

- **Status:** Decided
- **Variants:** Properties (6); YAML (1)
- **Definition:** The block of fields at the top of a note, which title notes and reading records use for their details.
- **Files:** book-sources.md, generate-notes.md, library-dashboards.md, notes-to-epub.md, read-in-orbis-reader.md, reading-records.md, settings-reference.md
- **Issues:** "frontmatter" in most pages; Obsidian's "Properties" (library-dashboards.md, notes-to-epub.md "Properties (frontmatter)"); "YAML" (generate-notes.md, "The YAML at the top of each file"). The count of "Properties" includes Obsidian's Properties view.
- **Approved term:** properties
- **Notes:** Original decision: If we're going to stick with Obsidian's vocabulary then we should probably go with Properties instead of Frontmatter.  See <https://obsidian.md/help/properties>
- **Revision (Oct 14):** Use "frontmatter" only where the guide shows the raw YAML block.

### hotkey

- **Status:** Decided
- **Variants:** keyboard shortcut (5)
- **Definition:** A key combination bound to a command in Obsidian's Hotkeys settings.
- **Files:** README.md, command-reference.md, display-settings.md, marks-and-notes.md, troubleshooting.md
- **Issues:** "hotkey" (display-settings.md, marks-and-notes.md) and "keyboard shortcut" (command-reference.md).
- **Approved term:** hotkey
- **Notes:** This is the term Obsidian uses in settings

### Kokoro

- **Status:** Consistent
- **Variants:** None
- **Definition:** A speech server that can generate recordings; text it records leaves the device.
- **Files:** listening.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Markdown

- **Status:** Consistent
- **Variants:** None
- **Definition:** The plain-text format Obsidian notes are written in.
- **Files:** README.md, annotations-and-presets.md, command-reference.md, format-support.md, generate-notes.md, getting-started.md, exporting-and-converting.md, marks-and-notes.md, notes-to-epub.md, orbis-file.md, save-annotations-as-pdf.md, save-as-markdown.md, settings-reference.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### MOBI

- **Status:** Decided
- **Variants:** Mobipocket (2)
- **Definition:** An older Amazon Kindle format, .mobi.
- **Files:** format-support.md, library-dashboards.md, save-as-markdown.md
- **Issues:** "Mobipocket" in format-support.md, "MOBI" elsewhere.
- **Approved term:** MOBI
- **Notes:** See notes on AZW3
- **Revision (Oct 14):** Uppercase, per the format-name convention. Defined in format-support.md.

### Obsidian

- **Status:** Consistent
- **Variants:** None
- **Definition:** The note-taking app Orbis Reader is a plugin for.
- **Files:** README.md, book-sources.md, command-reference.md, display-settings.md, format-support.md, generate-notes.md, getting-started.md, library-dashboards.md, listening.md, look-up.md, notes-to-epub.md, orbis-file.md, read-in-orbis-reader.md, reading-a-book.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Obsidian Sync

- **Status:** Consistent
- **Variants:** None
- **Definition:** Obsidian's own service for syncing a vault between devices; one of the sync tools the guide names.
- **Files:** settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### OPDS

- **Status:** Consistent
- **Variants:** None
- **Definition:** A standard feed format for book collections; Orbis reads OPDS 1.x feeds, not 2.0.
- **Files:** book-sources.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Open English WordNet

- **Status:** Decided
- **Variants:** WordNet (1); WordNet 2025 (1)
- **Definition:** Open English WordNet: an offline dictionary of modern English with parts of speech and examples, and no etymology.
- **Files:** look-up.md, settings-reference.md
- **Issues:** "Open English WordNet (2025)" (settings-reference.md), "WordNet" alone (look-up.md).
- **Approved term:** Open English WordNet; WordNet
- **Notes:** Original decision: Open English WordNet the first time it is used in a section.  Shorten to WordNet if it needs to be used again.
- **Revision (Oct 14):** Full name the first time in a section, then "WordNet".

### OpenAI-compatible

- **Status:** Consistent
- **Variants:** None
- **Definition:** The kind of speech-server interface Orbis's server engine talks to, as in Kokoro (OpenAI-compatible).
- **Files:** listening.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### OPF

- **Status:** Consistent
- **Variants:** None
- **Definition:** An EPUB's own metadata, which cataloging reads; named once (format-support.md) and never expanded.
- **Files:** format-support.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### PDF

- **Status:** Consistent
- **Variants:** None
- **Definition:** A fixed-layout document format Orbis can write but does not open.
- **Files:** README.md, book-sources.md, command-reference.md, format-support.md, exporting-and-converting.md, look-up.md, orbis-file.md, save-annotations-as-pdf.md, save-as-pdf.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Project Gutenberg

- **Status:** Decided
- **Variants:** Gutenberg (9)
- **Definition:** A free library of tens of thousands of public-domain books, provided as an OPDS feed with Orbis.
- **Files:** README.md, book-sources.md, format-support.md, look-up.md, read-in-orbis-reader.md, save-as-markdown.md, settings-reference.md
- **Issues:** "Gutenberg" alone in book-sources.md and settings-reference.md.
- **Approved term:** Project Gutenberg
- **Notes:**

### quick switcher

- **Status:** Consistent
- **Variants:** None
- **Definition:** Obsidian's search for opening a file by name.
- **Files:** reading-a-book.md, reading-records.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Restricted mode

- **Status:** Consistent
- **Variants:** None
- **Definition:** Obsidian's setting that stops community plugins running; it must be off for Orbis Reader to run.
- **Files:** getting-started.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### ribbon

- **Status:** Consistent
- **Variants:** None
- **Definition:** Obsidian's strip of icons at the side of the window, where Orbis adds icons for the Library and Book sources.
- **Files:** book-sources.md, library-dashboards.md, settings-reference.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### secret storage

- **Status:** Decided
- **Variants:** keychain (1)
- **Definition:** Obsidian's own per-device store for passwords, where book-source usernames and passwords are kept.
- **Files:** book-sources.md, sync-and-devices.md
- **Issues:** "Obsidian's own secret storage" (book-sources.md), "Obsidian secret storage" (sync-and-devices.md), "Obsidian's keychain" (book-sources.md).
- **Approved term:** Obsidian keychain; keychain
- **Notes:** Original decision: Obsidian's keychain the first time we refer to it in a section then just keychain if it needs to be discussed further.
- **Revision (Oct 14):** Obsidian's settings call it the keychain, and its list is titled Secrets. Write "Obsidian keychain" the first time in a section, then "keychain".

### Standard Ebooks

- **Status:** Consistent
- **Variants:** None
- **Definition:** A publisher of carefully typeset public-domain books, whose OPDS feeds need a membership.
- **Files:** README.md, book-sources.md, format-support.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### TTS

- **Status:** Decided
- **Variants:** text to speech (2); text-to-speech (1)
- **Definition:** Text to speech: a voice reading text aloud.
- **Files:** listening.md, settings-reference.md
- **Issues:** "text to speech (TTS)" in listening.md and settings-reference.md; "text-to-speech" in settings-reference.md's Listening description.
- **Approved term:** text-to-speech (TTS); TTS
- **Notes:** Original decision: text-to-speech (TTS) the first time it is stated in a section then just TTS for the sake of brevity.

### URL

- **Status:** Decided
- **Variants:** web address (3)
- **Definition:** The address of a web page or feed, such as an OPDS address.
- **Files:** book-sources.md, look-up.md
- **Issues:** "URL" and "address" alternate in book-sources.md ("OPDS address", "include it in the URL"); "web address" in book-sources.md and look-up.md.
- **Approved term:** URL
- **Notes:**

### vault

- **Status:** Consistent
- **Variants:** None
- **Definition:** The folder of notes Obsidian works in; books, title notes and Orbis's files all live in it.
- **Files:** README.md, annotations-and-presets.md, book-sources.md, command-reference.md, display-settings.md, format-support.md, generate-notes.md, getting-started.md, exporting-and-converting.md, library-dashboards.md, listening.md, look-up.md, marks-and-notes.md, orbis-file.md, reading-a-book.md, reading-progress.md, reading-records.md, save-annotations-as-pdf.md, save-as-markdown.md, save-as-pdf.md, search.md, settings-reference.md, sync-and-devices.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Web Clipper

- **Status:** Consistent
- **Variants:** None
- **Definition:** Obsidian's browser extension that saves a web page as a note, whose source property Orbis reads.
- **Files:** read-in-orbis-reader.md
- **Issues:** None
- **Approved term:**
- **Notes:**

### Webster's

- **Status:** Decided
- **Variants:** Webster's 1913 (2); Webster's Revised Unabridged Dictionary (2)
- **Definition:** Webster's Revised Unabridged Dictionary (1913): an offline dictionary of historical English with etymologies and archaic senses.
- **Files:** look-up.md, settings-reference.md
- **Issues:** Also "Webster's Revised Unabridged (1913)" (settings-reference.md) and "Webster's" alone (look-up.md).
- **Approved term:** Webster's 1913; Webster's
- **Notes:** Original decision: Webster's 1913 Dictionary the first time it is used and then maybe just "Webster's" for the sake of brevity.
- **Revision (Oct 14):** "Webster's 1913" (the Settings label) the first time, then "Webster's".

### wiki link

- **Status:** Decided
- **Variants:** wiki-link (2)
- **Definition:** Obsidian's [[double bracket]] link, one of the two link formats Save as Markdown can write.
- **Files:** orbis-file.md, save-as-markdown.md, settings-reference.md
- **Issues:** "wiki-link" in orbis-file.md; "wiki link" and the setting value **Wiki link** in save-as-markdown.md.
- **Approved term:** wikilink
- **Notes:** in Obsidian main settings it is referred to as a wikilink without a space or hyphen.  Should update labels as well as docs for this.
- **Revision (Oct 14):** Matches Obsidian's settings. UI labels change to match.

### WPM

- **Status:** Consistent
- **Variants:** None
- **Definition:** Words per minute, the unit of your reading pace.
- **Files:** reading-progress.md, troubleshooting.md
- **Issues:** None
- **Approved term:**
- **Notes:**

## Decision status

All "Decision needed" items are decided as of October 14, 2026. There are no open questions.

### Second pass (October 14, 2026)

The last four open questions are decided:

1. Every UI string that says "field" changes to "property" (53 strings).
2. Settings for save folders say "folder", not "location": **Default folder for notes files**, **Default folder for Markdown files**, **Default folder for EPUB files**, **Default folder for PDF files** and **Vault folder for config files**.
3. All "turn on", "switch on" and "switched off" UI strings change to "enable" and "disable".
4. The Stats tab labels change to **Reading speed**, **Estimated reading speed** and **Speed**.

The label changes are made (October 2026). The old labels are retired in `scripts/check-vocabulary.ts`.
5. "Theme list" becomes "Reader theme list".
6. UI strings follow the product-name rule: "Provided with Orbis" becomes "Provided with Orbis Reader" in all five strings that say it.
7. All other UI strings that say "Orbis" change to "Orbis Reader", except names: Orbis voice, Orbis marks and Orbis style.
8. "Orbis configuration" becomes "Orbis Reader configuration" in the feature name and in the UI labels. This replaces the exception in item 7. "config" becomes "configuration".
