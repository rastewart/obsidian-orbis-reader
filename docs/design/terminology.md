# Terminology

← [Design Docs](README.md)

This file lists the approved terms for the Orbis Reader user guide. The decisions and the evidence for them are in [glossary.md](glossary.md). The UI label changes that these decisions needed are made, and the old labels are retired in `scripts/check-vocabulary.ts`.

How to read the tables:

- **Term** is the approved term. Use it as written, including its capitalization.
- **Short form** is allowed after the term's first use in a section. A dash means there is no short form.
- **Do not use** lists the variants found in the guide that the term replaces.
- Words in bold are exact UI labels.

---

## Writing rules

1. **Capitalization.** Write approved terms in lowercase in prose. Exceptions: exact UI labels, feature names, and proper names.
2. **Feature names.** Use sentence case for feature names (Focus mode, Book sources, Reading records). The features are listed in [Features](#features).
3. **UI labels.** Write UI labels in bold, exactly as they appear in the product.
4. **Long form first.** When a term has a short form, write the long form the first time in a section. Use the short form after that.
5. **Product name.** Write "Orbis Reader" in prose and in UI strings. Do not shorten it to "Orbis". These names keep "Orbis": **Orbis voice**, **Orbis marks** and **Orbis style**.
6. **Settings paths.** Write the full path the first time in a section: **Settings → Orbis Reader → Reading behavior**. After that, write only the page or setting name: **Reading behavior**.
7. **Button and icon.** Use "button" for anything the user selects. Use "icon" only to describe the picture on a button.
8. **UI element types.** A window is a "dialog". A row under the toolbar is a "bar". A part of the Navigator is a "tab". Do not use "popup", "drawer" or "panel". The marks bar is the "marks bar" on every device, including a phone.
9. **Short references.** After you name an item in full, you can refer to it as "the bar", "the dialog" or "the player".
10. **Ellipsis.** Write the "…" at the end of a command or menu item only in command tables. Do not write it in prose.
11. **Titles and headings.** Use Title Case for page titles. Use sentence case for all other headings.
12. **Format names.** Write format names in uppercase (EPUB, MOBI, AZW3, FB2, CBZ). Write file extensions in code style (`.epub`).
13. **Hyphens.** Hyphenate a compound modifier before a noun ("full-screen player", "per-device setting"). Do not hyphenate it after the noun ("set per device").
14. **Spelling.** Use American English spelling. Write "gray", not "grey".
15. **Close button.** Call it the Close button. Do not write "X", "×" or "✕".
16. **Keyboard shortcuts.** Write shortcuts as `Ctrl/Cmd+P`.
17. **Existing rules.** The rules in `scripts/check-vocabulary.ts` still apply. They are listed in [glossary.md](glossary.md#existing-vocabulary-rules).

---

## Features

| Feature | What it is | Do not use |
|---|---|---|
| Advanced search | The search options for scopes, the mark filter and match options | — |
| Book sources | Browsing and downloading books from OPDS feeds into a vault folder | — |
| Focus mode | The reading view without the Orbis Reader toolbar | focus mode; full-screen reading |
| Generate notes | Writing a book's annotations to Obsidian notes | Generate notes file |
| Library dashboards | The feature that shows the library on dashboards | Library (for the feature) |
| Link preview | Showing a link's destination before you go to it | — |
| Listening | Reading a book aloud | read aloud; narration |
| Look-up | Finding definitions, vault notes and web results for selected text | Look up (for the feature); look-up |
| Notes to EPUB | Converting Obsidian notes into EPUB books | Save as EPUB (for the feature) |
| Orbis Reader configuration sharing | Writing configuration files to the vault so other devices can read them. UI labels: **Share Orbis Reader configuration in the vault**, **Orbis Reader configuration** | Orbis configuration sharing; Orbis data sharing; config (for configuration) |
| Pocket mode | Locking the full-screen audio player's controls | pocket mode; pocket listening |
| Read in Orbis Reader | Converting a note into a book and opening it in one step | — |
| Reading records | Writing one vault note for each annotation | — |
| Save annotations as PDF | Writing a book's passage selections and notes as a PDF | Save marks as PDF; Marks → PDF |
| Save as Markdown | Converting a book's text to Markdown notes | Export to vault; Book Export |
| Save as PDF | Converting a book to a PDF with its marks | — |
| Search | Full-text search of the open book and its annotations | — |

---

## Annotations and marks

| Term | Use for | Short form | Do not use |
|---|---|---|---|
| annotation | A bookmark, passage selection or annotation note | — | your marks; saved item |
| annotation note | A selected passage with your own text, with or without a mark | note | — |
| passage selection | A selected passage with a mark and no text of its own | — | passage mark; highlight |
| bookmark | A saved location in the book. It is anchored to the sentence at the top of the page when you create it. Only its reading record shows that sentence, as the excerpt | — | — |
| audio bookmark | A bookmark anchored to the sentence that is being read aloud | — | — |
| unmarked note | An annotation note without a mark | — | — |
| mark | A named appearance that you apply to a passage or note | — | — |
| appearance | The highlighter, the treatment, or both, of a mark | — | look |
| highlighter | The background color of a mark | — | highlight color; wash |
| treatment | The line or shape of a mark: underline, double underline, squiggle, strikethrough or box | — | — |
| badge | The short text or emoji that shows a mark where color cannot show | — | — |
| role | A job a mark does automatically. Set with **Use for** | — | — |
| annotation preset | A set of marks that books use | preset | — |
| default preset | The preset a book gets when you first open it | — | — |
| Orbis marks | The preset that Orbis Reader provides | — | — |
| **This book** | A mark that belongs to one book, not to its preset | — | book's own mark |
| inactive | A preset that is not offered when you assign a preset | — | — |
| scope | A mark's scope (**This book** or **Presets**), or a search scope. The context sets the meaning | — | — |
| note selection | The passage that an annotation note is attached to | — | — |
| highlight | Text that is highlighted during listening, or a search result. Not for applying a mark | — | — |
| marks bar | The bar that opens when you select text, on every device | — | highlight bar; highlight-color bar; drawer |
| **Marks manager** | The dialog where you define marks and presets | — | Marks dialog; marks manager |
| note editor | The dialog where you write an annotation note and select its mark | — | — |
| note icon | The icon in the margin that shows an annotation note. Select it to open the note | — | — |

---

## Reading and navigation

| Term | Use for | Short form | Do not use |
|---|---|---|---|
| toolbar | The main row of buttons at the top of the reader only | — | reader toolbar; Orbis toolbar |
| bar | A row under the toolbar | — | toolbar (for these rows) |
| search bar | The bar for a search query and its results | — | search toolbar |
| listening bar | The bar with the basic listening controls | — | Listen bar; listen toolbar; listening toolbar; read-along bar |
| display style bar | The bar that the **Display style** button opens | — | display toolbar; display menu; display style toolbar; Display styles bar |
| Go to bar | The bar for going to a location number or a percentage | — | Go to location bar |
| **Navigator** | The area with the Contents, Search, Annotations, Linked vault notes and Stats tabs | — | content panel; contents panel |
| **Annotations** tab | The Navigator tab that lists a book's annotations | — | Saved panel; Saved tab |
| table of contents | The book's own list of chapters | — | contents list |
| chapter | A top-level entry in the table of contents | — | — |
| section | A part of a book, a dialog or a page. The context sets the meaning | — | — |
| location | A position number that Orbis Reader calculates for a book. It does not match printed page numbers. Do not use "location" for a folder | — | location number |
| default folder | The folder where an export or a feature saves its files. UI labels: **Default folder for …** | — | default location |
| location index | The list of locations for a book, made the first time the book opens | — | — |
| reading location | Where you are in a book, saved for each device | — | reading position |
| jump | Going to another place in the book without turning a page | — | — |
| flash | A short animation on the passage you go to | — | — |
| back and forward buttons | The buttons that move through the places you jumped to | — | back icon; forward icon |
| exit button | The button that turns off Focus mode | — | — |
| Close button | The button that closes a dialog, a bar or the image viewer | — | X; ×; ✕ |
| ⋯ menu | The reader's menu of commands for the whole book | — | pane menu |
| **Paged mode** | Showing the book as screen-sized pages | — | paginated |
| **Scrolled mode** | Showing the book as one long scroll | — | Continuous scroll; scrolled view |
| two-column layout | Showing a page in two columns when there is space | — | column layout; double-column layout |
| display style | A saved set of display settings | — | style |
| named display style | A display style that you create | — | named style |
| **This device** | The display style that each device starts with | — | device style |
| reader theme | The background, text and link colors of a book | — | theme |
| progress indicator | The readout in the toolbar that shows your progress | — | readout; progress readout |
| reading stats | Pace, time remaining and word counts for the open book | — | reading statistics |
| reading speed | Your reading speed in words per minute. UI labels: **Reading speed**, **Estimated reading speed**, **Speed** | — | reading pace; pace |
| image viewer | The view that opens when you select an image | — | — |
| deep link | A link that opens a book at a location | — | — |

---

## Listening

| Term | Use for | Short form | Do not use |
|---|---|---|---|
| full-screen audio player | The full-screen view with the cover, progress bar and all listening controls | — | full-screen player; full screen audio player |
| voice chip | The button that shows the current voice and opens **Voice and source** | — | — |
| live voice | The voice that reads aloud without a recording | — | — |
| Orbis voice | A downloaded voice that works offline | — | neural voice; on-device voice |
| system voice | A voice that the operating system provides | — | — |
| multi-voice model | One download that contains many voices | — | — |
| recording | Audio files of a book's tracks, made in one voice and stored in the vault | — | recorded audio; generated audio |
| mix | A choice of voice for each track | — | — |
| track | The unit the audio player plays. Usually a chapter | — | — |
| speech engine | The software that changes text to speech | — | TTS engine; recording engine |
| speech server | A server that makes recordings | — | — |
| respelling | A word written the way it sounds | — | — |
| pronunciation glossary | The list of your respellings. Its dialog is titled **Pronunciation glossary** | — | Glossary (for the dialog) |
| **Downloaded voices** | The dialog that lists the Orbis voices on this device | — | — |

---

## Library

| Term | Use for | Short form | Do not use |
|---|---|---|---|
| library | All the title notes in the vault | — | — |
| **Library** | The default dashboard that Orbis Reader provides | — | — |
| Library view | The view that the ribbon icon and **Open the library** open. It shows the current dashboard | — | — |
| title | The name of a book, or an item in the library. A library item does not have to be a book | — | — |
| title note | The note that describes a title | — | — |
| catalog | To make a title note for a book. Also the noun "cataloging" | — | — |
| catalog review | The dialog for making or updating title notes for many books | — | cataloging review; uncataloged review |
| uncataloged | A book that no title note links to | — | — |
| dashboard | A set of widgets | — | — |
| widget | One part of a dashboard that shows one collection | — | — |
| collection | A named set of titles, selected by filters | — | — |
| condition | One rule in a collection's filters | — | — |
| property | A value in a note's properties, such as `reading_status`. A property used for sorting is a "sort property" | — | field; sort field |
| custom property | A property that you add on the **Properties** page | — | custom field |
| alias | Your own property name that the library reads as a library property | — | — |
| display name | The name that the library shows for a stored value. UI label: **Display name** | — | Shown as |
| cover | An image file in the vault that a title note links to | — | — |
| rating | Your rating of a book, from 0 to 5 in steps of a half | — | — |
| reading status | Your progress with a book: interested, reading, read, abandoned, or your own value | — | — |
| reading record | A vault note for one annotation | — | — |
| orphaned | A reading record whose annotation was deleted | — | — |

---

## Exports and conversions

| Term | Use for | Short form | Do not use |
|---|---|---|---|
| notes file | What Generate notes writes: one note, or a folder of notes | — | generated notes |
| notes style | Saved settings for Generate notes | — | note style; note export style; annotation export style |
| book folder | A folder with one note per chapter and a contents note | — | Book folder; per-chapter |
| chapter note | One note in a book folder | — | — |
| contents note | The note in a book folder that lists the chapter notes | — | — |
| **Single Obsidian note** | The option that writes an export to one note | — | Single note; single-file |
| digest | The PDF that Save annotations as PDF writes | — | — |
| cover sheet | The first page of a PDF from Save as PDF | — | — |
| legend | The part of a PDF that shows what each mark means | — | — |
| **Marked up by** | The name printed on a PDF | — | byline |
| **Expanded character set** | The font download that adds characters to PDFs. The Setup task is named **Expanded PDF character set**, where the other tasks have nothing to do with PDFs | — | PDF character set |
| **Marks to include** | The option that selects which marks an export includes | — | mark filter |
| **Filter by mark** | The Advanced search option that limits results to selected marks | — | Marks to include (in search) |
| collapsed section | A part of a dialog that opens when you select its header | — | fold |
| **Save to** | The section of an export dialog that sets the folder and file name | — | Location (for this section) |

---

## Files, devices and sync

| Term | Use for | Short form | Do not use |
|---|---|---|---|
| Orbis Reader | The product | — | Orbis |
| .orbis file | The file that holds a book's annotations and reading stats | — | Orbis file; annotation file; annotations file |
| `!orbis-data` folder | The folder beside your books where Orbis Reader stores its files | — | orbis-data |
| reading data | The page that a .orbis file shows | — | data page; reading-data view |
| reading-location file | The file for each device that records its reading location | — | reading-position file; location file |
| plugin's settings file | The file where Orbis Reader stores its settings. On sync-and-devices.md, write "the plugin's settings file (`data.json`)" | — | data.json (alone) |
| device | One vault on one computer, phone or tablet | — | — |
| device ID | The identifier that Orbis Reader makes for each device | — | — |
| **Device name** | The name you give a device | — | — |
| **Device locations** | The dialog that shows the reading location on each device | — | Device locations popup; sync prompt |
| **Use this vault on more than one device** | The switch that turns on multi-device use | — | master switch |
| sync tool | The tool that copies vault files between devices | — | — |
| feature | An optional part of Orbis Reader | — | capability |
| **Setup** | The settings page for turning on features. The verb is "set up" | — | setup (as a verb) |
| dialog | A window with a title and its own controls | — | popup; drawer; modal |
| preview | What Link preview shows: a link's destination, before you go to it | — | popup |

---

## Book sources and Look-up

| Term | Use for | Short form | Do not use |
|---|---|---|---|
| OPDS feed | An online catalog of books in OPDS format | feed | book source (for one feed) |
| source | Only in the UI labels **Add a source**, **Search this source** and **Browse book sources** | — | — |
| Calibre server | Calibre's content server | — | Calibre content server |
| Project Gutenberg | The public-domain library that Orbis Reader provides as a feed | — | Gutenberg |
| Standard Ebooks | A publisher of public-domain books whose feeds need a membership | — | — |
| offline dictionary | One of the two dictionaries that you can download for Look-up | — | — |
| Webster's 1913 | The historical English dictionary | Webster's | Webster's 1913 Dictionary; Webster's Revised Unabridged Dictionary |
| Open English WordNet | The modern English dictionary | WordNet | WordNet 2025 |
| search destination | A website that Look-up offers as a button | — | web destination |

---

## Action verbs

| Verb | Use for | Do not use |
|---|---|---|
| select | Selecting text, and activating any button, option or other UI element | choose; pick; press (for UI elements); click; tap |
| choose | Only for a decision that is not a UI action | — |
| press | Keyboard keys only: "press Enter" | — |
| run | Commands | trigger; invoke |
| enable | Turning on a setting or feature. UI labels use **Enable** | switch on; turn on; toggle on |
| disable | Turning off a setting or feature. UI labels use **Disabled** | switch off; turn off; toggle off; Switched off |
| check | Selecting a checkbox | tick |
| uncheck | Clearing a checkbox | untick |
| hover | Resting the pointer on an item | point at; pointing at |
| long-press | Holding a finger on a touch screen | long press; press and hold |
| drag | Moving an item with the pointer or a finger | — |
| pinch | Zooming with two fingers or a trackpad | — |
| swipe | Moving a finger across a touch screen | — |
| right-click | Opening a context menu with a mouse. Always with long-press | — |
| click, tap | Only when you name the gesture for each device, for example "double-tap or double-click" | — |

---

## Obsidian and external terms

| Term | Use for | Short form | Do not use |
|---|---|---|---|
| Obsidian | The app that Orbis Reader is a plugin for | — | — |
| vault | The folder of notes that Obsidian uses | — | — |
| Obsidian note | A Markdown file in the vault. "vault note" is also allowed | — | — |
| properties | The values at the top of a note | — | frontmatter; YAML |
| frontmatter | Only where the guide shows the raw YAML block | — | — |
| Obsidian base | An Obsidian database view of notes | base | Base; Obsidian Bases |
| command palette | Obsidian's list of commands | palette | — |
| hotkey | A key combination for a command | — | keyboard shortcut |
| pane | The area that a file opens in | — | — |
| Files pane | Obsidian's list of files | — | — |
| quick switcher | Obsidian's search for opening a file by name | — | — |
| ribbon | Obsidian's row of icons at the side of the window | — | — |
| context menu | The menu that opens when you right-click or long-press a file | — | — |
| community plugin | A plugin that is not made by Obsidian | — | — |
| Restricted mode | The Obsidian setting that stops community plugins | — | Safe mode |
| Obsidian keychain | Obsidian's secure storage for passwords. Its list is titled **Secrets** | keychain | secret storage |
| Obsidian Sync | Obsidian's service for syncing a vault | — | — |
| Web Clipper | Obsidian's browser extension that saves a web page as a note | — | — |
| wikilink | Obsidian's `[[double bracket]]` link | — | wiki link; wiki-link |
| trash | Where Obsidian puts deleted files. The delete control is the trashcan button | — | trashcan (for the place) |
| Markdown | The text format of Obsidian notes | — | — |
| text-to-speech (TTS) | Speech that a computer makes from text | TTS | text to speech |
| URL | A web address | — | web address |
| EPUB, MOBI, AZW3, FB2, CBZ | Book formats. Defined in format-support.md | — | Mobi; Kindle Format 8; FictionBook 2; Comic Book Archive |
| PDF | A fixed-layout document format | — | — |
| OPDS | A standard feed format for book catalogs | — | — |
| BRAT | A community plugin that installs plugins from their repository | — | — |
| CFI | Canonical Fragment Identifier: an exact location in an EPUB | — | — |
| DRM | Copy protection on some purchased books | — | — |
| OPF | An EPUB's metadata file | — | — |
| WPM | Words per minute | — | — |
| Kokoro | A speech server that can make recordings | — | — |
| OpenAI-compatible | The type of speech server interface that Orbis Reader uses | — | — |

---

## Open questions

None. All questions are decided, and the UI label changes are made.
