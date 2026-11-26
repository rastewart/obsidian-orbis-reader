# Fonts

← [Design Docs](README.md)

Fonts the reader can choose beyond the system's: where their files live, how a display style names one, how a book
gets it, and what the Font list offers. The code is `src/fonts.ts` (the library), `src/font-file.ts` (reading a
font file), `src/settings-fonts.ts` (the Fonts page), `src/FontImportModal.ts` (importing) and
`src/pdf-text-font.ts` (the PDF font) and `src/epub-font.ts` (the EPUB font).

Built in four steps. They are the folder, importing and the reader, then downloads, the PDF font and the EPUB font.

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
  (`fsType`). Without `OS/2`, the style comes from `head.macStyle`. A face whose name says Italic or Oblique is italic
  whatever its bits say, since OpenDyslexic's Italic sets none. The width tells a Condensed face from the normal one of
  its family, which can have the same weight and style (DejaVu Sans does).
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

**Published by `.github/workflows/fonts.yml`**, like the dictionaries and the test fixtures: on a push to main that
changes `src/font-pins.ts`, or by hand. A job that can only read runs `pnpm build:fonts`, and stops unless the build
leaves `src/font-pins.ts` unchanged, which means every zip is the one main's plugin pins. A zip already in the release
is downloaded and compared, never replaced; one it lacks is uploaded by a second job that holds the write token and
runs nothing of the repository's. Every zip built is attested, so `gh attestation verify <zip> --repo
<owner>/obsidian-orbis-reader` shows it was built from main — the seven first zips too, which were uploaded by hand
before the workflow existed and are the same bytes. The pins it checks are printed by `scripts/font-pins.ts`, from the
plugin's own `FONT_PINS`.

**Downloading** (`downloadFontPackage`) checks the size and SHA-256 against the pin and writes nothing on a mismatch,
then unpacks into the fonts folder keeping the zip's folder. A font counts as downloaded when every face of every one
of its families is in the vault, however it got there, and then it leaves this section for **Vault fonts**, where its
families' rows keep its description after their faces. Only the download row says a font has no italic. In the
vault, the faces listed say so. DejaVu also
needs its seven files by name, as the PDF export does. A font that has lost a file, or whose file is damaged, is listed
again, and the download replaces the files it has in the folder of the same name. The section's
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
- **Deleting one says what it costs.** The export needs all seven files, so deleting any of the three families puts
  PDFs back on the built-in fonts. The delete confirmation for those rows says so, and DejaVu is offered under
  Downloadable fonts again.
- **Its three families are fonts like any other**, switched on and offered for reading. On the Fonts page only, their
  rows say they are for PDF exports, as every downloaded font's rows keep its description. The Font lists say nothing.
- **The Setup task** (*Expanded PDF character set*) now shows Ready on every device the fonts have synced to.

---

## The PDF font

`pdfFont`, one setting behind a **Font** row on both PDF pages (like `pdfAttribution`), and a row in the export
dialog that changes it for one export. It travels with the other PDF settings.

- **The book's text only**: the four faces the writer calls `body`, `italic`, `bodyBold` and `bodyBoldItalic`. A PDF
  sets the book in serif and the reader's own words — headings, notes, the byline, the cover sheet — in sans, so every
  page says which words are whose; a chosen font does not undo that. Code stays monospaced.
- **Every font in the vault a PDF can use**, switched on for reading or not. Can use means a Regular face in a static
  file, with embedding bits that allow it (`embeddable`: not Restricted License, not Bitmap only). pdf-lib embeds a
  variable font at its default weight, Thin or Light as often as Regular, so variable files are left out, and a
  family with nothing else is not offered.
- **Which file draws each face** (`pdfFacesOf`): static, embeddable, the nearest normal width, then the nearest
  weight to 400, or 700 for bold. A SemiBold stands in for a missing Bold, as in the reader.
- **What it lacks comes from beneath it.** Each face the chosen font has takes its slot in the writer, and the face
  it replaced (DejaVu's, or the built-in one) stays beneath it as `body:under` and so on. A character the chosen
  face cannot draw goes to the face beneath first, so an accent in an italic word is still serif and italic, then
  to any face that has it. A face the family does not have is drawn by the default as it always was. Measuring
  follows drawing, so a line with a character another face draws is measured run by run.
- **Subset, except CFF and No subsetting** (`subsetAllowed`). TrueType files are subset as DejaVu is. An OpenType
  file with CFF outlines is embedded whole, rather than trusting pdf-lib's CFF subsetting, which some viewers draw
  wrongly. So is a face whose license bits say No subsetting (0x0100).
- **Never a failed export.** A face that cannot be embedded is drawn in the default, and a font not on this device —
  not synced yet, or deleted — gives the default font and a notice.
- **The default is named for what it is**: *Default (DejaVu Serif)* when DejaVu is here (or the dialog is about to
  download it), *Default (Times)* otherwise. DejaVu Serif is then not listed a second time, and a setting that names it, made
  while DejaVu was not whole, is the default (`pdfFontValue`). The settings row opens by the fonts already looked
  through and corrects itself by `pdfFontsReady`, which also counts the old cache. A chosen family is matched in any
  case.

---

## The EPUB font

`epubFont`, a **Font** row on the Save as EPUB page, and a field in **Book details** of each of the three conversion
dialogs that changes it for one conversion. It travels with the other EPUB settings. Read in Orbis Reader adds no
font, since it makes a book to read here, where the display style decides.

- **The whole book.** An EPUB holds no words of the reader's to set apart, so the body takes the font and the
  headings with it. Code keeps its monospace rule, which is more specific.
- **The same fonts as the PDF** (`readFaces`, shared): static files, embeddable. An EPUB could carry a variable font,
  but a reading app that cannot draw one draws nothing, and a book travels to more apps than the one that made it.
- **Embedded.** Each face's file goes in `fonts/` with a name an archive path can hold, manifested as `font/ttf` or
  `font/otf` (EPUB 3.3's core types), and `style.css` gains an `@font-face` per face, at the face's own weight and
  style, and `body { font-family }`. No generic fallback is named, so a reading app that refuses the font uses its own.
- **The license travels in the font.** The OFL asks for its notice with every copy, and accepts it in the font's
  own metadata. Each of the seven downloads carries its copyright and license text in its `name` table (checked
  when this was built); a font the reader imported may not, and is theirs to judge. No license file is added, since a
  manifest item of a type EPUB does not know needs a fallback, and nothing in the book refers to it.
- **The stylesheet's rule bent once.** It declares no typography so the reading app's settings win; a font the
  maker chose is the exception, since it was asked for. A reading app still lets the reader override it, and Orbis
  draws the display style's font over it unless that font is the book's (Default).
- **Changing the font does not move a saved position.** Positions point into the chapters, which a font does not
  touch, so `compareEpubs` calls the rebuilt book `same-text` and it is replaced without asking.
- **A font not on this device** makes a book without one, and a notice says so; a folder of books says it once.

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
| What the PDF font sets | The book's text | Serif for the book, sans for the reader's words, kept |
| A face or character it lacks | The default face beneath it | Missing glyphs print as `?` otherwise |
| Variable files in a PDF | Not used | pdf-lib draws one at its default weight only |
| What the EPUB font sets | The whole book, code aside | The book is all the book's own words |
| Variable files in an EPUB | Not used | Not every reading app draws one |
