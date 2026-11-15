# Test plans

← [Design Docs](../README.md)

Manual tests, run on real devices, one page per system of Orbis Reader. Each page is complete in itself: it says what it covers and what it leaves to other pages, sets up what it needs in **Setup**, puts things back in **Clean up**, and can be run on its own and in any order. Every expected result was checked against the code when the step was written, and the page was then run on the devices; a step that turns out wrong on a device is corrected on the page rather than worked around.

Automated tests are elsewhere: see [Integration test strategy](../integration-test-strategy.md). These pages cover what only a device can show — layout, touch, the keyboard, sync between devices, and how a book actually reads.

---
## Where each step runs

Every step carries one tag, and the same table heads every page.

| Tag       | Run it on                                                    |
| --------- | ------------------------------------------------------------ |
| `once`    | Any one device. The result does not depend on the device     |
| `each`    | Every device: Mac, Android, iPhone and iPad                  |
| `desktop` | The Mac — a pointer and a keyboard                           |
| `mobile`  | Android, iPhone and iPad — touch                             |
| `phone`   | Android and iPhone — a phone-sized screen                    |
| `ipad`    | The iPad                                                     |
| `android` | Android                                                      |

The desktop steps are run on a Mac. Testing was also performed on a Windows PC. Generally speaking, Orbis Reader has nothing written for one desktop system and not another; however, quirks specific to a given environment may be present. The plugin has not been tested on Linux.

---
## The pages

| Page | What it covers |
|---|---|
| [Reading a book](reading-a-book.md) | Opening each format, turning pages, the two layouts, jumping and coming back, the Navigator, the progress indicator, images, the toolbar |
| [Display](display.md) | Reader theme and the Reader theme manager, font, size, spacing, alignment and layout, the palette commands that step them, display styles |
| [Focus mode](focus-mode.md) | Entering and leaving it, what it hides on each kind of device, the bars that keep working inside it |
| [Search](search.md) | The search bar, the Search tab, landing on a result, Advanced search |
| [Marks and notes](marks-and-notes.md) | Marking passages, notes, bookmarks, the Annotations tab, the Marks manager and presets |
| [Look-up](look-up.md) | The Look-up dialog, its dictionaries, the vault, web destinations |
| [Listening](listening.md) | Voices, the listening bar and full-screen player, recordings, mixes, the pronunciation glossary, Pocket mode |
| [Annotation exports](annotation-exports.md) | Generate notes, notes styles, Save annotations as PDF |
| [Conversions](conversions.md) | Save as Markdown and Save as PDF of the book itself |
| [Notes to EPUB](notes-to-epub.md) | Save note or folder as EPUB, and Read in Orbis Reader |
| [Library dashboards](library-dashboards.md) | Title notes, cataloging, covers, status and rating, dashboards, collections, properties |
| [Reading records](reading-records.md) | A note per annotation: settings, bases, moving a book, deleting an annotation |
| [Book sources](book-sources.md) | OPDS feeds, browsing, downloading, signing in, failing feeds |
| [Sync](sync.md) | One vault on several devices: locations, shared configuration, marks arriving, notes made on two devices at once |
| [The .orbis file and resilience](orbis-file-and-resilience.md) | The `!orbis-data` folder and the reading data page; moved, deleted and damaged data; broken and hostile books; reloading |
| [Settings and commands](settings-and-commands.md) | The welcome, the Settings page and Setup, developer options, the commands no other page covers |

---
## How much to run

**After any build that reaches the devices — a quick check, on the Mac and one phone, with each page's Setup done.** From [Reading a book](reading-a-book.md), the first step of **Opening a book** and of **Turning pages**; from [Marks and notes](marks-and-notes.md), the first step of **Marking a passage**; from [Listening](listening.md), the first step of **The listening bar**; and from [The .orbis file and resilience](orbis-file-and-resilience.md), the first step of **Reload and restart**. Anything that fails there stops the run.

**After a change to one part of Orbis Reader — that part's page, every tag.** Run the quick check first. A change that reaches into another part takes that page too: a change to how marks are stored is a [Sync](sync.md) change as well as a [Marks and notes](marks-and-notes.md) one.

**Before a release — every page, every tag, on all four devices.** In the order the table above lists them, with two exceptions: [Settings and commands](settings-and-commands.md) starts from a factory reset of `test-vault`, so run it on its own; and [Sync](sync.md) needs two devices at once, so run it when both are to hand.

---
## Two vaults

Most steps run in your **synced vault**, so every device sees the same books. The repository's `test-vault` is the source of those books: its `fixtures` folder holds what every page uses (see `test-vault/fixtures/README.md`), and a page that changes or damages books copies them into a folder of its own first.

A vault with no repository beside it, such as a new vault on a phone with Orbis Reader installed through BRAT, gets the same files with **Download test fixtures (dev)**. It fetches them from the release of the installed version and, after asking, copies the files that differ into `fixtures`. `copy-fixtures-local.sh --all` does the same for the synced vault from the repository's working tree, so it also carries fixtures not yet released.

Some steps run in `test-vault` itself, on the Mac, because they reset or switch off something the synced vault's other devices would feel — a factory reset, a first run, a setting that travels. Each page says which steps those are.

---
## Writing and changing a step

One step per line, with a blank line between steps, and `---` above each heading.

Name where to look and what appears there: **Passage selections** counts one more, not "the count updates". Quote notices and labels exactly, from `src/i18n/en.ts`, and say "select", never click or tap.

Check every expected result against the code before writing it, and against a device before trusting it. A step written from a comment, or from code that never runs, will be wrong.

When a run finds a step wrong, change the step; when it finds Orbis Reader wrong, fix Orbis Reader and keep the step. Note each failure with the step, the device and what happened instead.
