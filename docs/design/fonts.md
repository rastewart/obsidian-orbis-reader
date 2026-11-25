# Fonts

← [Design Docs](README.md)

Fonts the reader can choose beyond the system's: where their files live, how a display style names one, how a book
gets it, and what the Font list offers. The code is `src/fonts.ts` (the library), `src/font-file.ts` (reading a
font file), `src/settings-fonts.ts` (the Fonts page) and `src/FontImportModal.ts` (importing).

Built in steps. This document describes step 1, the folder, importing and the reader. The later steps are listed at
the end.

---

## Where fonts live

**In the vault**, in one folder: `!orbis-data/fonts` unless the reader picks another (`fontsFolder`, empty for the
default, beside the configuration folder `!orbis-data/sync`). A font imported on one device reaches the others with
the rest of the vault. Obsidian Sync copies font files only with **Sync all other types** on; the guide already says
so for every file Orbis writes.

**The folder is looked through, not listed in a setting.** Every `.ttf` and `.otf` file in it, at any depth, is a
font, and a family is whatever the files say they are. A reader who drops files in by hand has imported them. The
import copies each family into a folder of its own name, so a license file can sit beside its fonts, but nothing
depends on that arrangement.

**Both settings travel** (`SHARED_SETTINGS_KEYS`): the folder, and `hiddenFonts`. A display style that travels names
a font, and the folder its files are in and the list it is chosen from should be the same on every device, as the
reader themes are.

---

## What a font file says

`readFontFile` reads the tables it needs and nothing else:

- **`name`**: the typographic family (ID 16) or else the legacy one (ID 1), so a Light face joins its family rather
  than becoming *Family Light*.
- **`OS/2`**: the weight, the width (`usWidthClass`), italic or oblique (`fsSelection`), and the embedding bits
  (`fsType`). Without `OS/2`, the style comes from `head.macStyle`. The width tells a Condensed face from the normal one
  of its family, which can have the same weight and style (DejaVu Sans does).
- **`fvar`**: a variable font's weight axis, so one file can be both regular and bold.

**TrueType and OpenType only.** Those are what the reader, a PDF (pdf-lib through fontkit) and an EPUB can all use.
WOFF and WOFF2 are compressed copies of the same tables, made for web pages, and WOFF2 needs Brotli to read. A
collection (`.ttc`) is several fonts in one file. Both are refused with the reason.

**The four faces.** `facesCovered` maps files to Regular, Italic, Bold and Bold Italic. Bold is weight 600 or more,
so a SemiBold stands in where there is no Bold, as the browser would choose it anyway.

---

## Importing

A file picker, then a dialog that shows each family with the faces its files cover, before anything is copied.
`gatherImport` (`src/font-import.ts`) sorts what was chosen into families, with no Obsidian in it so it can be tested.

- **A zip is opened, not refused**, since a font is usually downloaded as one. Its `.ttf` and `.otf` files are read
  at any depth, macOS's `__MACOSX` and `._` copies are skipped, and a license file in it (`OFL.txt`, `LICENSE…`) is
  copied with every family the zip held, so the license sits beside the font in the vault.
- **Static files win over a variable copy of the same family.** Google's zip of a variable family holds the variable
  files and a `static` folder of every weight. Both would give the browser two descriptions of the same faces, and
  the static ones are what a PDF can use.

- **A family needs a Regular face**: without one there is nothing to draw ordinary text with, so it is listed with
  the reason and not imported.
- **The other three are wanted, not required.** The reader slants or thickens Regular for a missing face. The
  dialog names what is missing, so a reader who chose one file knows to choose the rest.
- **The same family again** adds its files, replacing files of the same name.

The picker is an `<input type="file">` in the document of the window the button is in: on a computer Settings is a
window of its own, and a picker opened from the main window would appear behind it.

---

## A display style names a family

A vault font's value is its family, quoted: `"Literata"`. A system font's value is the CSS list it always was. So:

- **Moving the folder breaks nothing**, and a font that has not synced yet is still the font the style asks for.
- **An older version of Orbis** reading a synced style gets a CSS family it cannot find, and draws the default font.

---

## How a book gets the font

A book's chapters are separate documents, each with its own set of fonts. `useFontIn(doc, value)` adds a `FontFace`
for each of the family's faces to the document, made with that document's own `FontFace` constructor. Called again, it
brings the document up to date: a face added since is given, one whose file changed is given again, one whose file is
gone is taken back, and one that failed to load is tried again. The files of the two fonts last read in stay in
memory, for the chapters still to come; a look through the folder keeps no others. Called:

- from `applyDocStyles`, as each chapter is styled;
- from `applyPluginSettings`, for the chapters already open when a font arrives;
- from the settings preview, the Fonts page and the mark samples of the annotation presets, in their own window's
  document.

**`FontFace`, not `@font-face` with a file address.** Nothing has to resolve a URL inside the book's frame, which
behaves the same on every platform. The engine already relays out when fonts finish loading (a resize observer on the
body, and `fonts.ready`).

---

## The Fonts page

Three sections, **Vault fonts**, **System fonts** and **Downloadable fonts**, because their rows differ: only a
vault font can be deleted, and a download has a button rather than a switch. The system fonts are in alphabetical
order, as the vault's are. The downloads come last: they are mostly used once, when setting up, and the two lists a
reader keeps coming back to should not sit below them.

**Names in Obsidian's font, a sample in the font.** Each row's description ends with a line of sample text drawn in
the font. A name in its own typeface was tried first and dropped: a symbol or decorative font cannot draw its own
name readably, fonts of very different sizes make the rows uneven, and a reader who chose a font for its legibility
should not have to read the list in every other one. If a font cannot draw the sample, only the sample suffers.

---

## What the Font list offers

`fontChoices(hidden, current)`: the book's own fonts, Obsidian's, then every font switched on.

- **One alphabetical list** after those two, system fonts and the vault's together. The two lead because they choose
  *which* font rather than being one.
- **A system font this device does not have is marked** *(not on this device)*, found by measuring a line of text
  with the font and a fallback against the fallback alone (`systemFontStatus`). `document.fonts.check()` cannot
  answer this: it says true for a font that does not exist, since there is nothing to load.
- **Android answers some names with its own fonts**: Georgia, Times New Roman and Palatino draw its serif, Arial and
  Verdana its sans-serif, and only Trebuchet MS is missing (confirmed on a device). On Android only, a present font
  is also measured against the device's serif and sans-serif, and a match is marked *(device serif)*.
  Elsewhere the test would be wrong: on Windows and macOS, Times New Roman and Arial *are* the default serif and
  sans-serif.
- **The font in use is always offered**, switched off or not here yet, so the list never shows a value it cannot
  hold.

---

## Keeping current

`watchFonts` registers vault events: a font file created, deleted, renamed or changed in the folder starts a new look,
and a look that finds something different tells every open book (`refreshViews`). So does a fonts folder that another
device changed. However many requests arrive during a look, one more look answers them, not the one under way: moving
the folder fires an event per file before the one for the folder, and the setting follows only on the last.

**A file that cannot be read is left out, and only that file.** A sync tool can list a file before its contents are
here, or while only part of them is. A font whose tables run past the end of the file is *damaged*, and the next change
to the file looks again.

**Moving the folder.** When the setting changes, the Fonts page moves the fonts and their licenses, and nothing else:
the setting can name any folder of the vault, one with books and notes in it too. The move goes through Obsidian's file
manager so a sync tool sees a move. A folder that holds only fonts and licenses moves whole; from any other the fonts
move one at a time, and the rest stays. A file whose name is taken in the new folder stays, and so does one that could
not be moved, and a notice says how many. Only the device that changed the setting moves anything. **A folder moved in
the file explorer** is followed: the setting changes to match. A move made by the Fonts page changes the setting first,
so it is not followed twice.

**Deleting a font** moves its files to the trash. A folder goes as a whole only when all it holds, at any depth, is
that family and licenses; from any other folder only the family's files go, and the fonts folder itself always stays.

---

## Downloads

Seven fonts are offered on the Fonts page (`font-downloads.ts`): OpenDyslexic, Atkinson Hyperlegible, Lexend,
Literata, Source Serif 4, EB Garamond, and DejaVu for the PDF export.

**One zip per font, in this repository's `fonts` release.** A reader downloads only the fonts they want, and one font
can be updated without the others. A zip is all or nothing: one download, one checksum, and every file unpacked or
none, where loose files could leave three faces of four after a dropped connection. The zip carries the font's
license, so it lands beside the font in the vault, as the OFL asks.

**Built by `pnpm build:fonts`** (`scripts/build-fonts.ts`):

- **Every input pinned**: each file from a fixed commit of the font's own repository (DejaVu from a fixed npm
  version), checked against its SHA-256 before it is packed.
- **The projects' own static files, unchanged.** A PDF embeds a variable font at its default weight (Thin for
  Bitter, Light for Merriweather), so each zip holds the separate Regular, Italic, Bold and Bold Italic files the
  project publishes; Lexend has no italic. Converting a variable font to static faces ourselves would make a modified
  version, which a font with a Reserved Font Name (Merriweather) may not be under its own name.
- **The same bytes every time**: entries sorted and dated 1980-01-01, as the test fixtures are packed. It writes the
  zips to `dist/fonts/` and `src/font-pins.ts` (each zip's name, size and SHA-256), formatted by Biome.
- **A zip is never replaced once published.** An update is a new name (the font's own version is in it, e.g.
  `literata-3.103.zip`) and a new pin, so an older build still downloads the zip it pinned.

**Downloading** (`downloadFontPackage`) checks the size and SHA-256 against the pin and writes nothing on a mismatch,
then unpacks into the fonts folder keeping the zip's folder. A font counts as downloaded when every one of its
families is in the vault, however it got there, and then it leaves this section for **Vault fonts**. The section's
description says what the fonts are and where they come from — the one network request on the page — and the
README's network table lists GitHub for it.

**Embedding.** Every font offered allows it: the OS/2 `fsType` of each file is 0 (installable) or, for OpenDyslexic,
8 (editable), and each is under the SIL Open Font License 1.1 (DejaVu under the Bitstream Vera license).

### DejaVu

DejaVu moved from the PDF settings, where each device downloaded it into the plugin's own `font-cache` folder, to the
Fonts page and the vault (`pdf-fonts.ts`). The PDF export finds its seven files by name anywhere in the fonts folder,
and counts them only when all seven are whole. If one still cannot be embedded, the PDF is drawn with the built-in
fonts.

- **The old copy is used, not moved.** Until DejaVu is in the vault, the export reads the old cache. Moving it into the
  vault on every device would be several devices writing the same files into a synced folder at once, which is how
  sync conflicts begin.
- **And then deleted**, on each device, once DejaVu is in the vault — downloaded there, or arrived from another
  device (`forgetLegacyPdfFonts`, on every change to the fonts). Only that device's plugin folder is touched.
- **Its three families are fonts like any other**, switched on and offered for reading. On the Fonts page only, their
  rows say they are used for PDF exports; the Font lists say nothing.
- **The Setup task** (*Expanded PDF character set*) now shows Ready on every device the fonts have synced to.

---

## Later steps

1. ~~The folder, importing, and the reader.~~
2. ~~Downloads.~~
3. A font for Save as PDF and Save annotations as PDF, falling back to DejaVu for missing characters and faces.
   Its list offers every font in the vault: the Fonts page's switches are for reading only (see Decisions).
4. A font for Save as EPUB and Notes to EPUB, embedded in the book.

---

## Decisions

| Decision | Chosen | Why |
|---|---|---|
| Where fonts live | A vault folder | One import or download for every device |
| Which files | Everything in the folder | A font dropped in by hand is a font |
| A style names | The family, quoted | Survives a moved folder and a slow sync |
| File types | TTF and OTF | Usable by the reader, PDF and EPUB alike |
| Loading | `FontFace` per chapter document | No file addresses inside the book's frame |
| Missing faces | Regular required, others wanted | Text needs Regular; the rest can be imitated |
| The list | Switches off, all on by default | A font that arrives is offered without a step |
| Downloads | One zip per font, from this repository's release | Pick what you want; all-or-nothing; license travels with it |
| Faces in a download | The project's own static files | A PDF embeds a variable font at its default weight |
| DejaVu's old copy | Used until DejaVu is in the vault, then deleted | Moving it on every device would race in the synced folder |
| What the switches cover | The reading Font list only | Exports offer every vault font; a font hidden for reading may still be wanted in a PDF |
