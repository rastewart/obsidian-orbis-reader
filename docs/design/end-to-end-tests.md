# End-to-End Tests

← [Design Docs](README.md) | See also: [Integration Test Strategy](integration-test-strategy.md), [Test plans](test-plans/README.md)

`pnpm e2e` builds the plugin, starts a separate Obsidian on your computer with a fresh vault of the test fixtures,
runs the end-to-end tests in it, and closes it. It prints a line per test and exits with an error if any fails.

```sh
pnpm e2e                 # every test
pnpm e2e "opens EPUB"    # the tests whose name contains this text (give several to run each one's tests)
pnpm e2e --update        # rewrite the golden files from this run, after checking the change is right
pnpm e2e --keep          # keep the run's vault and Obsidian data afterwards, to look at what a test left
```

A failed test leaves a screenshot of the window in `e2e/.out/`, beside any output that differed from its golden
file.

---

## Where it fits

The unit tests (`pnpm test`) check Orbis's own logic without Obsidian. The end-to-end tests check that the built
plugin works inside Obsidian. They open real books in each format, make marks and write notes, and they catch an
error anywhere in the console. The device test plans cover what neither can reach, which is the browser engines of
iPhone, iPad and Android, and how the reader feels to use.

They run on your computer, **not in CI**. A CI runner offers Linux, which is not a platform Orbis is tested on, and
an unattended Obsidian there would fail for reasons that have nothing to do with Orbis. On your computer they run
the Obsidian you use, on Windows or macOS, and a full run takes about seven and a half minutes on a Mac, build
included. A minute of that is running every command, and twenty-odd seconds reading records; `pnpm e2e "<name>"`
runs one test while you work on it.

In the order of a release (Feature Development Guide, *The order of a release*), they run after CI passes and before
a beta or a release is tagged.

---

## How it works

| File | What it does |
|---|---|
| `e2e/launch.ts` | Finds Obsidian, builds the run's vault and Obsidian data folder, starts Obsidian, and turns the plugin on |
| `e2e/cdp.ts` | Talks to the Obsidian window over the Chrome DevTools Protocol, collects errors, presses keys, takes screenshots |
| `e2e/in-page.ts` | The functions that run inside Obsidian, and the parts of `app` and `OrbisReaderView` they reach |
| `e2e/runner.ts` | The test shape, `expect`, golden files and closing dialogs |
| `e2e/run.ts` | The command. Runs the tests one after another in one window, stops if Obsidian freezes, and lists the known issues |
| `e2e/tests/` | The tests |
| `e2e/golden/` | The output the tests compare with |

**A separate Obsidian.** Obsidian is started with its own `--user-data-dir`, so it runs beside the Obsidian you have
open and shares nothing with it, neither its vault list nor its settings nor its local storage. It never opens your
vaults. Each run gets a new folder under the system's temporary folder, deleted at the end. Its window opens and
closes by itself, and on a Mac it shows as a second Obsidian icon in the Dock while it runs.

**The Obsidian version you use.** Obsidian installs updates as an app file, `obsidian-<version>.asar`, in its own
settings folder. The run copies the newest one, so the tests run the version you run rather than the one the
installer came with.

**Finding Obsidian.** The launcher looks where Obsidian installs by default.

| Platform | Executable |
|---|---|
| Windows | `%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe`, then `C:\Program Files\Obsidian\Obsidian.exe` |
| macOS | `/Applications/Obsidian.app/Contents/MacOS/Obsidian`, then `~/Applications/…` |
| Linux | `/usr/bin/obsidian`, `/opt/Obsidian/obsidian`, `~/.local/bin/obsidian` |

Set `ORBIS_E2E_OBSIDIAN` to the executable to use another. On a Mac it must be the executable inside the app bundle,
not `open -a Obsidian`, which passes its arguments only to an Obsidian that is not already running.

**The vault.** The fixtures git tracks in `test-vault/fixtures`, the same files the fixtures pin covers, so a run
starts from the same state on every computer. The marks and sidecars your own testing leaves there are not tracked,
and not copied. The plugin is installed from the `main.js`, `manifest.json` and `styles.css` that `pnpm build` wrote.

**The trust prompt.** A vault Obsidian has not seen opens in Restricted mode and asks whether to trust its plugins.
The launcher turns community plugins on through Obsidian's plugin manager, which is what answering yes does, and the
dialog is closed with the others.

**Dialogs.** Before each test, and after a book opens, every open dialog is closed with Escape, as a person closes
them. Orbis raises some on its own, among them the welcome and the device-locations and reading-records prompts.
Obsidian's dialogs are `.modal-container`s and Orbis's own are `.orbis-popup`s, placed in the page's body, and both
are looked for. A dialog that Escape does not close fails the test, since a person using the keyboard would be stuck
in it. A test that saves through a dialog presses its main button (`saveDialog`) and picks a choice by its label
(`pickInDialog`), so the dialog itself is tested too.

**Settings are put back after each test.** Before a test the runner takes a copy of Orbis's settings, the plugin's
`data.json` and what this device keeps in local storage, and afterwards it puts back whatever the test changed. So a
test may switch reading records on or turn Link preview off without the next test meeting it. Orbis keeps its device
settings (Link preview, page turning by key, the toolbar's buttons) in memory as well as in storage, so when one of
those changed the runner turns Orbis off and on, which reads them afresh. Three values Orbis changes by itself are left
alone, listed in `OWN_BOOKKEEPING` in `e2e/run.ts`. They are the version it last greeted the device with, the sync
clock, which only moves forward, and the shipped preset it installs again whenever it loads. `ORBIS_E2E_SHOW_RESTORED=1` prints what was
put back after each test.

**Each test starts with no tabs open.** Generate notes and the conversions open what they write beside the book, and
left there those notes pile up in splits until a later book is squeezed into a pane too small for turning a page. The
runner closes every tab before each test (`closeEveryTab`), and `openBook` puts the book's tab in front and focused,
as a person's opening it does.

**Notices.** Obsidian removes a notice after a few seconds, so the launcher keeps each one as it appears, and a test
reads what Orbis said with `noticesSince`.

**Deleting and renaming.** The test vault sends deleted files to its own `.trash`, deleted with the run, never to the
computer's trash, and updates links to a renamed file without asking, as Obsidian's question would wait for an answer.

**Links that leave Obsidian.** No test opens an `obsidian://` link through the system, which could hand it to the
Obsidian you use. `openOrbisLink` calls Orbis's handler in the test window instead, and the link-check test presses
Cancel, never Open.

**Your clipboard.** Electron's clipboard is the computer's, so a test that copies would replace what you copied. Once
Orbis is on, the launcher has `navigator.clipboard` keep the text in the page, where `copiedText` reads it.

**A frozen window.** A layout that never ends stops the window running script, and every wait on it would last
forever. A test that does not finish fails at its time limit (60 seconds, or its own `timeoutMs`). The run then asks
the window for an answer, and if none comes within 5 seconds it reports that Obsidian stopped responding, names the
tests it did not run, and ends Obsidian with every process it started.

**Errors.** Every uncaught exception and every `console.error` during a test fails it, unless the test lists it in
`allowErrors` or it is a known issue (below).

---

## Writing a test

A test file exports a list of tests, named for the file (`bookTests`, `notesTests`). Each has a name and an async
`run`, which gets the page, the vault folder and `golden`. Add the list to `ALL` in `e2e/run.ts`.

```ts
import { openBook } from '../in-page';
import { dismissDialogs, type E2eTest, expect } from '../runner';

export const bookTests: E2eTest[] = [
  {
    name: 'opens EPUB',
    async run({ page }) {
      const book = await page.run(openBook, 'fixtures/parts-and-chapters.epub', 30_000);
      await dismissDialogs(page);
      expect(book.sections > 0, 'the book has no sections');
    },
  },
];
```

**`page.run(fn, ...args)`** runs `fn` inside Obsidian and returns its result. `fn` crosses as source text, so it can
use only its arguments and the page's globals, never a variable from the test file, and its arguments and result
cross as JSON. Put a function the tests share in `e2e/in-page.ts`, and add what it reaches in Orbis to the
`ReaderView` type there. That type is the list of what the tests depend on, so a refactor that renames one of those
fields knows to change it.

**Wait for a state, not for a time.** Poll until what the test needs is true (a document rendered, the marks
loaded) and fail after a timeout. A fixed sleep is either too short on a slow computer or wastes time on a fast one.
The exception is pacing that stands for a person, such as the gap between two marks.

**Golden files.** `golden('name.md', text)` compares `text` with `e2e/golden/name.md`. The first run writes the
file. Read it before committing it, because from then on the tests hold Orbis to it. Remove what changes from run to
run before comparing, such as today's date. When a change to the output is intended, run `pnpm e2e --update` and
commit the new file with the change.

**Make it fail first.** A new test should fail on the code it guards against. The notes test was checked by putting
the old sort back, and it reported the passages out of book order.

---

## The tests

The tests run in the order below. Running every command is last, because it changes the most settings.

| File | Test | What it checks |
|---|---|---|
| `books.ts` | opens EPUB, MOBI, AZW3, FB2, CBZ | The book renders, has sections, and for text formats has contents and shows text past the cover. A comic shows a page image |
| | every fixture opens, with the contents it had before | Every book git tracks in `fixtures` opens without an error, with no garbled characters, and its title, author and contents match `fixture-contents.txt` |
| `place.ts` | a book reopens where the reader left it | Closed and opened again, a book is at the section and location it was saved at, on a page boundary |
| | a book keeps its place when Orbis reloads | Orbis turned off and on rebuilds the book's view at the same place |
| | a book keeps its place behind another tab | The technical book's chapter with a bordered table, hidden behind a note and shown again. Without foliate patch 8 it froze Obsidian |
| | a book left at its cover reopens on the cover page | Without foliate patch 39 the cover was shifted sideways |
| `navigation.ts` | the chapter and page commands land where they say | Next and previous chapter land on a chapter's first page; next and previous page turn one page |
| | back and forward return across a jump | After a jump from the contents, Go back and Go forward return; a new jump drops the way forward |
| | go to location goes there, and says what it cannot do | 50% lands near the middle; a location past the end and 150% give their messages and keep the bar open |
| | a link copied to a place opens the book there | Copy link to current location, opened through Orbis's link handler, opens the book at that section |
| | the commands offered with a note in front, and with a book | The palette's Orbis commands in each case, matching `commands-offered.txt` |
| `notes.ts` | generate notes lists passages in book order | Three paragraphs marked first, third, then second come out in book order, matching `generate-notes.md`, in a note Obsidian reads without a problem |
| `marks.ts` | marks made in quick succession are all kept | Twenty marks made 5 to 20 ms apart are all held, and all saved, through a reload |
| | copy passage selections gives them in book order | The copy from a MOBI, in book order, matching `copy-passage-selections.md` |
| | generate notes writes one file per chapter | The dialog's *Book folder* choice, from an AZW3, matching `generate-notes-per-chapter.md`, with links that lead somewhere |
| | marks and notes come back in MOBI and FB2, on the same text | Closed and reopened, each mark and note is held, and its stored place still covers the text it marked |
| | a changed or removed mark stays changed through a reload | A mark given another mark, one removed and a note deleted, all as they were left after Orbis reloads |
| | bookmarks are kept, and each copy command lists what the book holds | The bookmark command adds and removes; bookmarks survive closing; the three copy commands say when there is nothing, and match `copy-annotations.md` |
| | save annotations as PDF is offered once a passage is marked | Not for a book with nothing marked, nor with only a bookmark |
| `conversions.ts` | save as Markdown | Twelve exports of eight books in four formats, including the Conversions plan's hard books, each matching its `markdown-*.md`; every note has frontmatter Obsidian reads and no link that leads nowhere |
| | save as PDF, save annotations as PDF | Each writes a PDF with pages |
| | save as PDF carries the marks, with a cover sheet and a comment per note | Neither appears for a book with no marks |
| | save note as EPUB makes a book that opens | The book's contents match `note-as-epub-contents.txt` |
| | read in Orbis Reader opens a note as a book | The note's prose is in the book shown |
| `epubs.ts` | converting a note again when nothing changed writes nothing | "already up to date", and the book's file untouched |
| | read in Orbis Reader keeps one book per note | Twice on one note leaves one book; a very long note name gives a book name of 80 characters or fewer |
| | a folder of notes becomes one book, a set of books | The folder's book in its index note's order (`folder-epub-contents.txt`); the set's six books and a contents note, and "already up to date" the second time |
| `exists.ts` | generating notes again, saving a book as Markdown again | *Save as new version* writes a numbered copy and leaves the first alone; *Replace* (confirmed, for notes) writes over it |
| `search.ts` | search finds a word and a result lands on it | The results match `search-boathouse.txt`, the next Enter shows a page holding a result, and the book then closes without an error |
| | a search with no match finds none, and a new search replaces the last | |
| | advanced search finds marks and notes, and matches case and whole words | Each scope finds only its own kind; Match case and Whole word narrow the results |
| `checks.ts` | hostile-scripts, stylesheet-checks, stylesheet-hazards | Each book's own checks read PASS, none FAIL |
| | an empty file, a file that is not a book, a cut-off EPUB | The tab says why, matching `open-*.txt` |
| `links.ts` | a link out of the book is shown in full before it opens | Each row of `link-checks.epub` but two, matching `link-checks.txt`, which holds its dialog, warnings and which button is red, or the notice refusing a script |
| | a note reference shows its note, and Go and back work | In an EPUB with footnotes, one with endnotes and an FB2, matching `note-previews.txt`; the book does not move until Go |
| | with link preview off, a note reference goes to its note | |
| `display.ts` | the display commands stop at their limits, and the book follows them | Font size 80–300%, line spacing 1–3 with no stray decimals, brightness 20–100%, margins 0–12%, the alignment cycle and its notices; text at 150% is half as large again |
| | the reader's alignment and size reach a book's own styles | `body-text-styles.epub`'s justified text goes left while its centered and right-aligned lines stay; `keyword-sizes.epub`'s sizes grow |
| | text on a book's own backgrounds stays readable in Light, Sepia and Dark | Every line of `contrast-checks.epub` that can be measured is at least 3 : 1; the white words over the picture stay white |
| | focus mode hides the toolbar, comes out again, and is not remembered | |
| | the page keys turn the page, unless the setting is off | Right, Space and Page Down forward; Left and Page Up back; Up and Down not; none of them with the setting off |
| `resilience.ts` | a renamed or moved book keeps its marks and place | Its reading data takes the new name and the new folder, and the book reopens with its mark at its place |
| | a deleted book takes its reading data with it | With the notice the plan quotes |
| | damaged reading data is written again from the marks | A `.orbis` emptied or not JSON is written again with its marks; a damaged place opens the book at its start |
| | the reading data folder mends itself | The readme is put right and comes back, the page index is rebuilt, and the folder deleted while Obsidian runs comes back |
| | scan annotation data finds nothing wrong | |
| | a mark made on a whole paragraph is stored over its text | A range on the paragraph element, as the listening player's paragraph mark makes from a recording |
| | scan puts a mark and a note stored empty back on their passages | Offered as *can be repaired*, and after **Repair** each covers its passage, through a reload |
| `records.ts` | reading records follow the marks and notes, and keep what the reader wrote | A record per mark and note, with its bases; a changed mark updates it and keeps the reader's line; a record nobody wrote in goes with its mark, one they did stays, orphaned |
| `library.ts` | a book is cataloged, and its status and rating set from the reader | The title note matches `catalog-title-note.md`; status and rating are written to it, and a rating cleared |
| `sync.ts` | another device's mark appears in the open book | A device file written under another device's id, as the Sync plan's first run does. The mark appears without reopening, on its text |
| `commands.ts` | every command runs without an error | Each command the palette offers with a book open, toggles twice. Three are left out, each with its reason in `SKIP` |

Each of the first set of tests was made to fail first, on the code it guards; for the hostile book that needs both of
desktop's protections removed, which was not done. It passes here because nothing got through, which proves least on
desktop, and its device run is still the check that matters. The second set was written against the test plans and
checked against what the plans say, and three of its tests found the bugs below on their first runs; not every one of
them has been made to fail on purpose.

**Helpers that mark and note.** `markParagraphs` and `noteParagraph` select a paragraph from its first character to its
last, as a person's selection runs. A range on the paragraph element itself, `(p, 0)` to `(p, n)`, is stored with its
start and end at the same place (see *What the tests found*).

---

## Known issues

`KNOWN_ISSUES` in `e2e/run.ts` lists errors Orbis is known to report that are not fixed yet. One of them is printed as
seen rather than failing the run, so the run stays a reliable yes or no while the bug stays in view. Remove an entry
with its fix.

The list is empty. Each entry so far was an error from foliate's paginator, fixed in the fork (its
`ORBIS-CHANGES.md`).

- **The paginator walked a chapter's document before the document had a body**, in about one run in three. Fixed by
  foliate patch 40.
- **A frame closed mid-load unobserved a document with no body.** Its `destroy` passed `document.body` to
  `ResizeObserver.unobserve` while the chapter was still loading. Fixed by foliate patch 41.
- **A resize while the paginator had no section reported a place in it.** Closing a book's tab mid-load left the
  paginator's section index at -1 or undefined, and the view's `getCFI` read `book.sections[index].cfi` for it. Fixed
  by foliate patch 42.

The last two came from a book's tab closing while foliate was still at work, which *the reading data folder mends
itself* and *a deleted book takes its reading data with it* meet.

---

## What the tests found

Writing them turned up these, each fixed with its test.

- **Marks made quickly could lose one.** Each save announces that the book changed, and the view reloaded its marks
  from the file, dropping one made while an earlier save was still being written. Fixed in `AnnotationController`
  (`savesInFlight`); *marks made in quick succession are all kept*.
- **Save as Markdown pressed early wrote other notes.** Saving before the dialog had named the book's unlisted
  sections wrote them as `Section 4` and split the book differently. Fixed in `BookExportModal` (`naming`);
  *save as Markdown: technical-book.epub*.
- **Closing a book with search results threw an error for each.** Fixed in `SearchController` (`forgetAnnotations`);
  *search finds a word and a result lands on it*.
- **The paginator's error on a document with no body.** foliate patch 40, above.

The second set found these.

- **A paragraph marked while a recording played was stored as an empty range.** With the mark button set to
  **Paragraph**, the listening player marks a recorded track's paragraph by the element itself
  (`enclosingBlockRange`), from `(p, 0)` to `(p, n)`. `tightenRange` left such a range alone when its text had no space
  at either end, and its CFI came out with the same start and end, `epubcfi(/6/10!/4,/4,/4)`. The mark and the note
  were saved, but showed nothing, and Scan annotation data for problems called them broken ranges. The live voice
  marks by the text and was never affected. Fixed in `tightenRange`, which now moves an end on an element onto its
  text; *a mark made on a whole paragraph is stored over its text*. A mark already stored this way still names its
  paragraph, so the scan now offers **Repair** for it when the paragraph's text is the text it stored
  (`collapsedElementPath`); *scan puts a mark and a note stored empty back on their passages*. The test helpers had
  made such marks too, and the golden files carrying a mark's link held these empty ranges until they changed.
- **A space in a link's host was a web page on desktop.** Row 17 of `link-checks.epub`, `https://exa mple.com/`, was
  shown as a web page at `exa%20mple.com` with Open, where Safari refuses the address. `readLinkAddress` trusted
  `new URL()`, and Chromium accepts a space in a host by encoding it. Fixed by checking the host before parsing;
  *a link out of the book is shown in full before it opens*.
- **A chapter Calibre split in two was two chapters.** Calibre gives the second file of a split chapter the first's
  `<title>`, and with no heading of its own that title was its name, so `continuationSections` kept it as a section of
  its own, with a second heading, `# Chapter 3, Calibre Body Anchors`, in the note. A file whose heading repeats the file just before it now
  continues it; *save as Markdown: calibre-body-anchors.epub as one note*.
- **Two errors from foliate when a book's tab closed mid-load.** foliate patches 41 and 42, above.

And these, left as they are for now.

- **Save as Markdown pressed before the location index is built splits a book differently.** `sectionContinues`
  answers from the location index, which the book builds after it opens, and says no section continues until then.
  Saved before that, a file that continues a chapter (`omnibus.epub`'s *This file continues*) is written as a note of
  its own named `Section 13`. The index is built once, when a book is first opened, so a person would have to open
  a book for the first time and save it before looking at the dialog; the Markdown tests, which press Save at once,
  wait for the index instead.
- **To look at, not known to be wrong.** In `endnotes.epub` and `fb2-notes.fb2` a note's preview runs on through the
  notes after it, where `footnotes.epub`'s holds one note (`note-previews.txt`).
