# Test plan — Reading a book

← [Design Docs](../README.md)

Opening a book in each format, turning pages, the two layouts, jumping around the book and back again, the Navigator, the progress indicator, the image viewer and the toolbar. What a user sees is in the guides: [Reading a book](../../guide/reading-a-book.md), [Reading progress](../../guide/reading-progress.md) and [Format support](../../guide/format-support.md).

**Not here:** Focus mode, display settings, search, marks and notes, and another device's reading location. Each belongs to its own page.

---
## Where each step runs

Every step carries one tag.

| Tag       | Run it on                                                    |
| --------- | ------------------------------------------------------------ |
| `once`    | Any one device. The result does not depend on the device     |
| `each`    | Every device: Mac, Android, iPhone and iPad                  |
| `desktop` | The Mac — a pointer and a keyboard                           |
| `mobile`  | Android, iPhone and iPad — touch                             |
| `phone`   | Android and iPhone — a phone-sized screen                    |
| `ipad`    | The iPad                                                     |
| `android` | Android                                                      |

---
## Setup

- [ ] `once` In `test-vault/fixtures/!orbis-data/`, delete every file whose name starts with `First-Open.epub`, so the book opens as if for the first time. On a device synced from the Mac, check they have gone there too.

- [ ] `once` In **Settings → Orbis Reader → Appearance → Toolbar**, every button is on. In **Reading behavior**, **Turn pages with the keyboard** and **Link preview** are on, and every mode under **Reading progress indicator** is on.

- [ ] `once` In **Display style → Layout**, **Mode** is **Paged mode** and the two-column button is off. The steps below start from there.

---
## Opening a book

- [ ] `each` Open `First-Open.epub`. The book renders at its first page with no error notice. While it loads, the toolbar's progress indicator shows numbered steps, **1/6 preparing…** to **6/6 opening book…**; on a fast machine they pass too quickly to read, and the book rendering is the pass.

- [ ] `once` A `First-Open.epub.orbis` file now exists in `fixtures/!orbis-data/`, beside a `First-Open.epub.location.<device>.json` for the device you opened it on.

- [ ] `each` Turn five pages, close the book's tab and open the book again. It reopens at the page you left, not at the start.

- [ ] `each` Open `annotation-workhorse.mobi`, `parts-and-chapters.azw3` and `parts-and-chapters.fb2` in turn. Each renders, turns pages, and has a contents list on the Navigator's **Contents** tab.

- [ ] `once` Open `cafe-and-co.mobi`. The Navigator's **Contents** tab lists **Crème Brûlée & Coffee**, **Señora Muñoz’s Table**, **Smørrebrød & Søren** and **Œuvres & Hors-d’œuvre**. Add the book to the Library: it is **Café & Co.**, by **Zoë Lefèvre & Søren Ågård**. Nowhere does `&amp;` show, or a letter as two odd characters such as `Ã©`.

- [ ] `desktop` Open `technical-book.epub` and, on the **Contents** tab, go to **Records and Fields**, which holds a ruled table. Open any other note in a second tab and switch between the two tabs several times. Obsidian stays responsive, and the book comes back on the same page. A table with borders in a hidden book used to freeze Obsidian on the switch.

- [ ] `once` Open `sample-comic.cbz`. The pages are images and turn like any book's, and pages 2 to 6 each show their number large in the middle.

- [ ] `desktop` In `sample-comic.cbz`, in a pane wider than tall, turn **Two-column layout** on: pages 2 and 3 show side by side. Turn it off: one page shows, at once, without reopening the book, and each page turn moves one page, 2 to 3 to 4. Make the pane narrow and tall: one page shows either way. Pressing on a page selects no text, and no marks bar appears.

---
## Turning pages

Use `annotation-workhorse.epub` from here on.

- [ ] `each` Select the right edge of the page: it turns forward. Select the left edge: it turns back.

- [ ] `mobile` Swipe left and right. The page turns with the swipe, in both directions.

- [ ] `mobile` Open `sample-comic.cbz` and swipe left and right, with long swipes and short, quick flicks. The page turns with the swipe, in both directions, one page per swipe, and the image viewer does not open. Tap a page: the image viewer opens.

- [ ] `desktop` Open `technical-book.epub` at its cover with **Two-column layout** off, in a pane much wider than tall. The cover keeps its shape, centred, and is not stretched across the page.
- [ ] `desktop` Close `technical-book.epub` while its cover shows, and open it again, with **Two-column layout** on and then off. The cover is where it belongs from the first moment: centred in one column, in the left column of two. It is not shifted sideways until a page turn.

- [ ] `each` Turn **Show page arrows** off in **Settings → Orbis Reader → Reading behavior**. The ‹ and › disappear from the open book at once, and on the Mac they stay hidden with the pointer over them. Select where each one was: the right edge still turns forward and the left edge back. Turn it back on: they return.

- [ ] `once` With **Show page arrows** off on one device, open the same book on another. Its arrows still show: the setting is per device. Turn it back on.

- [ ] `desktop` Right arrow, **Space** and **Page Down** each turn forward; left arrow and **Page Up** turn back. Up and down arrows do not turn the page.

- [ ] `desktop` Turn **Turn pages with the keyboard** off in **Settings → Orbis Reader → Reading behavior**. None of the five keys above turns the page now — the arrows, **Space**, **Page Up** or **Page Down** — and a hotkey you have bound to one of them runs instead. Turn it back on.

- [ ] `once` Run **Go to next chapter** and **Go to previous chapter** from the command palette. Each lands at the start of the next or previous chapter. Run **Go to next page** and **Go to previous page**: each turns one page.

---
## Two layouts

- [ ] `each` Open **Display style → Layout**. **Mode** reads **Paged mode**, and beside it is the two-column button. Set **Mode** to **Scrolled mode**: the book reflows into one scrolling column at about the same place, and the two-column button disappears.

- [ ] `each` Scroll down through the end of a chapter into the next, then back up. The text scrolls smoothly and the chapter changes without a page break.

- [ ] `each` Set **Mode** back to **Paged mode**. The book returns to pages at about the place you had scrolled to, and the two-column button is back.

- [ ] `once` Run **Toggle scrolled mode** from the command palette: the book scrolls. Run it again: back to pages.

- [ ] `desktop` Turn the **Two-column layout** switch on, with the reader pane wide. The page shows two columns of text. Narrow the pane until it is too small for two: it falls back to one. Widen it again, then turn the switch off to go back to one column.

- [ ] `phone` Turn the **Two-column layout** switch on in portrait: one column still shows, since a phone is too narrow. Rotate to landscape: two columns, and the **Layout** tab's three rows fit above Obsidian's toolbar. Rotate back, and turn the switch off.

- [ ] `mobile` Rotate between portrait and landscape a few times. The book reflows each time and stays at about the same place.

- [ ] `once` Run **Toggle column layout** from the command palette. It turns the two-column preference on, and running it again turns it off.

---
## Jumping and coming back

- [ ] `each` Open the Navigator with **☰**. The **Contents** tab lists the book's chapters, and the current one is highlighted. Close the Navigator, turn pages into the next chapter, and open it again: the highlight has moved.

- [ ] `each` Open `omnibus.epub`, whose contents run well past one screen, and on the **Contents** tab select a chapter near the end. Turn a few pages, then open the Navigator again: the list opens scrolled so the highlighted chapter sits in the middle, without scrolling it yourself. Switch to the **Annotations** tab and back to **Contents**: the highlighted chapter is still in view.

- [ ] `once` Close and reopen `omnibus.epub`, which opens where you left off, and open the Navigator before turning a page: the chapter is already highlighted and in view.

- [ ] `each` In `omnibus.epub`, on the **Contents** tab, select the second entry, then turn back to the book's first page, the title page, which comes before the first contents entry. Open the Navigator: the first entry is highlighted, not the second.

- [ ] `desktop` Open the Navigator with **☰**, then press the down arrow: the keyboard lands on the highlighted chapter, not the first row, and the list stays where it is.

- [ ] `each` Select a chapter on the **Contents** tab. The book goes there and the Navigator closes. A **←** back button appears at the top right of the page.

- [ ] `each` Select **←**. The book returns to where you were before the jump, and a **→** forward button appears. Select **→**: back to the chapter. Turn a few pages normally: no new back step is added.

- [ ] `each` Select **←** again, so **→** shows, and turn a few pages: **→** is still there, and selecting it goes back to the chapter. Select **←** once more and, on the **Contents** tab, select a different chapter. The book goes there and **→** disappears: a new jump replaces what was ahead.

- [ ] `each` Select three chapters in turn on the **Contents** tab, then select **←**: **←** and **→** both show at the top right of the page. Note where **←** sits and select it again: it has not moved. Keep selecting **←** until it disappears: **→** stays exactly where it was, and does not slide into the place **←** left.

- [ ] `once` **Go back** and **Go forward** from the command palette do the same as the two buttons.

- [ ] `android` With a book open and nothing over it, use Android's back gesture once. Obsidian handles it, not Orbis Reader, so note what happens. Whatever it does, the book is not left blank or frozen: if it closed, open it again and it is at the page you left. The gesture does not step back through the book's jumps the way **←** does.

- [ ] `each` Run **Go to location** from the command palette. A bar opens under the toolbar: **Go to:**, a field reading **e.g. 47 or 34%**, **Go**, and a line saying **Locations do not match standard page numbers. Navigation is approximate.** Enter `50%` and select **Go**: the book goes to about the middle and the bar closes.

- [ ] `once` Open **Go to location** again and enter a location number: the book goes there. Open it again and enter one larger than the book's total: the line under the field reads **Enter a location between 1 and N, or a percentage (0–100%)**, and the bar stays open. Enter `150%`: it reads **Enter a percentage between 0 and 100**.

- [ ] `desktop` In the **Go to location** bar, **Enter** goes and **Escape** closes the bar.

- [ ] `each` Select the progress indicator until it shows book locations (**📖 N / total**), and go to the first page of the book: it reads **📖 1**, never **📖 0**. Enter `60` in **Go to location**: the indicator reads **60** or less, never more. It names the location at the top of the page, and the page that opens is the one location 60 starts on, so the bigger the page — a large window, a small font — the more locations it holds and the further below 60 its top can be.

- [ ] `each` On that page, select a passage and give it a mark. In **Annotations**, its **loc.** is the indicator's number or a little more, never less. Bookmark the page: the bookmark's **loc.** is the indicator's number, or one less when the page opens partway through a sentence. **Reading stats** shows the same number on its **Location** row.

- [ ] `once` Select the progress indicator until it shows chapter locations (**📑**), and go to the first page of a chapter from **Contents**: it reads **1 /**. Go to the chapter's last page: the two numbers match, or nearly. **Reading stats** shows the same on its **Chapter location** row.

- [ ] `once` Open `parts-and-chapters.azw3` and keep the indicator on chapter locations (**📑**). From **Contents**, go to **CHAPTER II**: it reads **1 /**. Turn back one page, to the end of **CHAPTER I**: the two numbers match, or nearly, and never read **1 /** of the next chapter. Do the same in `annotation-workhorse.mobi`.

- [ ] `each` Open `footnotes.epub` and select a footnote marker in the text. A preview shows the note's text with a **Go** button, and the book does not move. Select **Go**: the book goes to the note, and **←** brings you back to the marker.

- [ ] `once` Open `endnotes.epub`, which keeps every chapter's notes in a **Notes** chapter at the back. In **Chapter One**, select the **2** after *Two notes in one paragraph*. A preview opens on *2. Note 1-2, the first of two in one paragraph.*, with **Go**, and the book stays in **Chapter One**. Select **Go**: the book goes to that note in **Notes**, and **←** brings you back.

- [ ] `once` Open `fb2-notes.fb2`, which keeps its notes in a notes section at the end, as FB2 books do. In **Chapter One**, select the note marker after *Two notes in one paragraph*: the preview opens on *Note 2, the first of two in one paragraph.*, and the book does not move.

- [ ] `once` Turn **Link preview** off in **Reading behavior**. Selecting a footnote marker now goes straight to the note. Turn it back on.

---
## The Navigator

Back in `annotation-workhorse.epub`.

- [ ] `each` Open the Navigator. It has five tabs, whose tooltips are **Table of contents**, **Search**, **Annotations — bookmarks, passage selections and notes**, **Linked vault notes — notes that reference this book** and **Reading stats**.

- [ ] `each` The Navigator has no **×**. Select the page beside it: the Navigator closes. Open it again and select **☰** again: it closes too.

- [ ] `desktop` Open the Navigator and press **Escape**. It closes, and the keyboard is back on **☰**: **Enter** opens the Navigator again.

- [ ] `once` On a book read for only a few pages, **Reading stats** shows **Gathering data…** under **Reading speed**, with a count such as **(3 / 8 samples)**, and **—** for both rows of **Time remaining**. Keep reading at a normal speed: after eight pages the speed appears in words per minute and the times fill in, each starting with **~**.

- [ ] `once` Once the location index has built, **Reading stats** shows **Progress** with a **Location** row for the book and the chapter, and **Word counts** with **Book total**, **Book remaining** and the chapter's count.

---
## The progress indicator

- [ ] `each` Select the progress indicator in the middle of the toolbar repeatedly. It steps through book percent, chapter percent, book locations, chapter locations, book time remaining and chapter time remaining, then a blank stop, then book percent again. The book modes carry 📖 and the chapter modes 📑.

- [ ] `once` Before eight pages have been read, the two time modes show **—** rather than a time.

- [ ] `once` Leave the indicator on the blank stop, close the book and reopen it. It opens blank. Select it to bring it back.

- [ ] `once` In **Reading behavior → Reading progress indicator**, turn off every mode but one. The last one cannot be turned off, and says **The indicator needs at least one mode.** Selecting the indicator now steps between that mode and the blank stop. Turn the modes back on.

- [ ] `once` **Cycle reading progress display** from the command palette steps the indicator the same way.

---
## Looking at an image

- [ ] `each` Open `volumes.epub` and, on the **Contents** tab, select **A VIEW OF THE MARKET CROSS** under **VOL. III.** The page shows **PLATE 1**, a large cross, above **CHAPTER I.** Select it. It opens over the page, fitted to the reader, with **A view of the market cross** along the bottom.

- [ ] `mobile` Pinch to zoom in: the alt text hides, and the small print along the plate's bottom, **ZOOM IN TO READ THIS**, can be read. Drag to pan. Double-tap: back to fitted. Double-tap on a detail: it zooms to that spot.

- [ ] `each` With **PLATE 1** open, the **←** and **→** at the top right are hidden, and **Copy image** and **×** are clear. Press the right arrow: the page behind does not turn. Select a chapter in the Navigator: the image closes and the book goes to that chapter.

- [ ] `desktop` Scroll or pinch on the trackpad to zoom until **ZOOM IN TO READ THIS** along the plate's bottom can be read, and drag to pan. Double-click: back to fitted.

- [ ] `each` While zoomed in, a single tap or click goes back to fitted; at fitted, a single tap or click closes the viewer. **✕** closes it too, and so does **Escape** on the Mac.

- [ ] `once` Dim the book with the brightness slider in **Display style → Theme**, then open the image. The viewer is dimmed the same way, not a bright white. Set the brightness back.

- [ ] `each` With the plate open, select **Copy image**, to the left of **✕**. The viewer stays open and a notice says **Image copied to clipboard**. Close it, open a note and paste: the plate appears, at full brightness even with the book dimmed, and a `Pasted image` PNG is in the attachment folder.

- [ ] `mobile` Paste the same copy into another app, such as a messaging app: the plate arrives there too.

- [ ] `android` Copy an image in Chrome and paste it into a note: Chrome's image lands, not the plate copied before it.

---
## The toolbar and the ⋯ menu

- [ ] `each` The toolbar shows, left to right: **Navigator**, **Search in book**, **Bookmark this location** and **Listen**; the progress indicator in the middle; then **Toggle note icons**, **Display style**, **Annotation marks** and **Focus mode**. On the Mac each name is the button's tooltip.

- [ ] `desktop` Press Shift+Tab from the book until a toolbar button has the keyboard. The left and right arrows move along the toolbar, wrapping at the ends, and **Home** and **End** go to its first and last buttons. No page turns. **Escape** puts the keyboard back on the book: the right arrow turns the page again.

- [ ] `desktop` With the keyboard on **Bookmark this location**, press **Enter**. The bookmark is added and the keyboard stays on the button; **Enter** again removes it. Now select the button with the mouse: the bookmark is added, and the right arrow turns the page straight away.

- [ ] `desktop` Open **Search in book** and the display style bar, then reach the toolbar from the keyboard. The down arrow moves row by row: the Display style tabs, the open tab's controls, then the search bar. The up arrow climbs back, landing on **Search in book** from the search bar and on **Display style** from the tabs.

- [ ] `once` In **Appearance → Toolbar**, turn off one button on the left and two on the right. They leave the toolbar at once, and the progress indicator stays centered. Turn them back on.

- [ ] `each` Open the book's **⋯** menu. Its Orbis Reader items come in five groups, separated by lines: **Show reading data**; the library's **Open title note** or **Catalog this book**, **Set reading status…** and **Rate this book…**; **Manage recordings and mixes…**; **Open notes**, **Generate notes…**, **Save annotations as PDF…** and **Reading record settings…**; then **Save as Markdown…** and **Save as PDF…**. The library group appears only when the Library is on.

- [ ] `once` On a book with no marks, **Save annotations as PDF…** is grayed out.

- [ ] `ipad` Open the book's **⋯** menu, then select the page of the book. The menu closes, as it does over a note.

---
## Clean up

- [ ] `once` Put back anything turned off above: the toolbar buttons, **Turn pages with the keyboard**, **Link preview** and the progress modes. In **Display style → Layout**, **Mode** is **Paged mode** and the two-column button is off.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
