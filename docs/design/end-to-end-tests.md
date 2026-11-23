# End-to-End Tests

← [Design Docs](README.md) | See also: [Integration Test Strategy](integration-test-strategy.md), [Test plans](test-plans/README.md)

`pnpm e2e` builds the plugin, starts a separate Obsidian on your computer with a fresh vault of the test fixtures,
runs the end-to-end tests in it, and closes it. It prints a line per test and exits with an error if any fails.

```sh
pnpm e2e                 # every test
pnpm e2e "opens EPUB"    # the tests whose name contains this text
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
the Obsidian you use, on Windows or macOS, and the tests take about three minutes once the build is done. A
minute of that is running every command; `pnpm e2e "<name>"` runs one test while you work on it.

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

The tests run in the order below. Running every command is last, because a command can change a setting.

| File | Test | What it checks |
|---|---|---|
| `books.ts` | opens EPUB, MOBI, AZW3, FB2, CBZ | The book renders, has sections, and for text formats has contents and shows text past the cover. A comic shows a page image |
| `place.ts` | a book reopens where the reader left it | Closed and opened again, a book is at the section and location it was saved at, on a page boundary |
| | a book keeps its place when Orbis reloads | Orbis turned off and on rebuilds the book's view at the same place |
| | a book keeps its place behind another tab | The technical book's chapter with a bordered table, hidden behind a note and shown again. Without foliate patch 8 it froze Obsidian |
| | a book left at its cover reopens on the cover page | Without foliate patch 39 the cover was shifted sideways |
| `notes.ts` | generate notes lists passages in book order | Three paragraphs marked first, third, then second come out in book order, matching `generate-notes.md` |
| `marks.ts` | marks made in quick succession are all kept | Twenty marks made 5 to 20 ms apart are all held, and all saved, through a reload |
| | copy passage selections gives them in book order | The copy from a MOBI, in book order, matching `copy-passage-selections.md` |
| | generate notes writes one file per chapter | The dialog's *Book folder* choice, from an AZW3, matching `generate-notes-per-chapter.md` |
| `conversions.ts` | save as Markdown | Four books in four formats, a note per chapter, each matching its `markdown-*.md` |
| | save as PDF, save annotations as PDF | Each writes a PDF with pages |
| | save note as EPUB makes a book that opens | The book's contents match `note-as-epub-contents.txt` |
| | read in Orbis Reader opens a note as a book | The note's prose is in the book shown |
| `search.ts` | search finds a word and a result lands on it | The results match `search-boathouse.txt`, the next Enter shows a page holding a result, and the book then closes without an error |
| `checks.ts` | hostile-scripts, stylesheet-checks, stylesheet-hazards | Each book's own checks read PASS, none FAIL |
| | an empty file, a file that is not a book | The tab says why, matching `open-*.txt` |
| `commands.ts` | every command runs without an error | Each command the palette offers with a book open, toggles twice. Three are left out, each with its reason in `SKIP` |

Each test except the self-checking books was made to fail first, on the code it guards. For the hostile book that
needs both of desktop's protections removed, which was not done. It passes here because nothing got through, which
proves least on desktop, and its device run is still the check that matters.

---

## Known issues

`KNOWN_ISSUES` in `e2e/run.ts` lists errors Orbis is known to report that are not fixed yet. One of them is printed as
seen rather than failing the run, so the run stays a reliable yes or no while the bug stays in view. Remove an entry
with its fix.

The list is empty. Its first entry was an error from foliate's paginator, which walked a chapter's document before
the document had a body, in about one run in three. foliate patch 40 fixed it (the fork's `ORBIS-CHANGES.md`).

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
