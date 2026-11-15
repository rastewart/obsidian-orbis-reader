# Test plan — Focus mode

← [Design Docs](../README.md)

Entering and leaving Focus mode, what it hides on each kind of device, what floats over the page while it is on, and the bars and marks that keep working inside it. What a user sees is in the guide: [Reading a book → Focus mode](../../guide/reading-a-book.md#focus-mode).

**Not here:** the progress indicator's modes ([Reading a book](reading-a-book.md)), the display settings themselves ([Display](display.md)), and Pocket mode, which locks the controls while listening ([Listening](../../guide/listening.md)). Each belongs to its own page.

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

- [ ] `once` Open `annotation-workhorse.epub`. In **Settings → Orbis Reader → Appearance → Toolbar**, **Focus mode** and the reading progress indicator are on, and in **Display style → Theme** the **Reader theme** is **Sepia** and brightness 100%. If **Sepia** is not in the list, switch it on in **Appearance → Reader theme manager**. Sepia makes a strip of the wrong color easy to see.

- [ ] `once` Select a chapter on the **Contents** tab, then **←**, so the page has both a **←** and a **→** button.

---
## Going in and coming out

- [ ] `each` Select **Focus mode**, the rightmost button on the toolbar. The Orbis Reader toolbar disappears and the book takes its room. A floating **×** sits at the top right, roughly where **Focus mode** was, with **←** and **→** to its left at the same height. The progress indicator is centered along the bottom.

- [ ] `phone` Obsidian's tabs, the header above the book, the mobile toolbars and the status bar along the top of the screen are all hidden. The book runs from the top of the screen to just above the gesture bar, with no black strip at the top.

- [ ] `ipad` Obsidian's tabs, the header above the book, the mobile toolbars and the status bar along the top of the screen are hidden, and the book fills the screen. The **×** is the topmost thing on it.

- [ ] `android` Android's navigation bar stays, and the page runs underneath it. The progress indicator sits fully above the navigation bar, not under it, whether Android uses gestures or the three buttons — check both if the phone lets you switch between them.

- [ ] `desktop` Only the Orbis Reader toolbar is hidden. Obsidian's tabs, the sidebars and the header above the book — **←**, **→**, the file's path and **⋯** — stay, and nothing of the book covers the header.

- [ ] `each` Select **×**. The toolbar comes back and the book returns to its normal size, with **←** and **→** back at the top right of the page.

- [ ] `once` Enter Focus mode again and run **Toggle focus mode** from the command palette. It leaves Focus mode the same way.

- [ ] `mobile` Open `technical-book.epub` and, on the **Contents** tab, go to **Records and Fields**, which holds a ruled table. Enter Focus mode and select **×**. Obsidian stays responsive, the toolbar comes back, and the page is laid out at its normal size and turns normally. A table with borders used to freeze Obsidian on Android when leaving Focus mode.

- [ ] `once` Enter Focus mode, close the book's tab and open the book again. It opens out of Focus mode: Focus mode is not remembered.

---
## What floats over the page

- [ ] `each` In Focus mode, the **×**, **←** and **→** buttons and the strips of page behind them, at the top and behind the progress indicator at the bottom, are all the book's sepia, not black and not Obsidian's gray. The indicator's text is the book's brown.

- [ ] `each` Set brightness to 50% in **Display style → Theme** before entering Focus mode. In Focus mode the strips, the buttons and the indicator are dimmed with the page, not left at full brightness around it. Set it back to 100%.

- [ ] `each` Select the progress indicator: it cycles its modes, through the blank stop and back, as it does on the toolbar. Its text never overlaps the last line of the page, at **Font size** 100% and at 200%, in **Paged mode** and in **Scrolled mode**.

- [ ] `each` Select **←**: the book goes back, and **→** appears. Select **←** again until it disappears: **→** stays exactly where it was, and **←** never shifted while **→** came and went.

- [ ] `once` Select an image — the plate in `volumes.epub` under **A VIEW OF THE MARKET CROSS** — while in Focus mode. The progress indicator and the **←** and **→** buttons hide while the image is open, and come back when it closes.

- [ ] `mobile` Rotate between portrait and landscape in Focus mode. The book reflows, and the **×**, **←**, **→** and the indicator stay in their places.

---
## Bars in Focus mode

- [ ] `each` Open **Search in book** and search for a word, then enter Focus mode. The search bar sits below the **×** without overlapping it, and the book's text starts below the bar — none of it hidden under it. The bar, its field and its buttons are in the book's colors, and the bar's **×** lines up under the focus-mode **×**. Results can still be stepped through.

- [ ] `each` With the search bar open in Focus mode, **←** still shows, to the left of the **×** on the same row, above the bar: going to the first result added that back step. Select **←**: the book goes back to where it was before the search.

- [ ] `each` Close the search bar in Focus mode: the text moves back up to use the space. Run **Open search** from the command palette: the bar comes back, below the **×** again.

- [ ] `each` Leave Focus mode, open the search bar, and enter Focus mode again. The same: below the **×**, with the text below it.

- [ ] `desktop` With the search bar open in Focus mode, move the mouse over its field and select into it. The field stays in the book's colors, not Obsidian's dark default.

- [ ] `mobile` With the search bar open in Focus mode, rotate the device. The bar and the text below it settle again, and the bar does not collide with the **×**.

- [ ] `each` Open the listening bar with **Toggle listening bar** from the command palette while in Focus mode. It shows and works. Close it the same way.

---
## Marking passages in Focus mode

- [ ] `phone` In Focus mode, select a word on the top line of the page. The marks bar appears at the bottom of the screen, over the progress indicator, not over the text you selected. Mark the passage, change its mark, add a note and delete it: each works, and the bar is in the book's colors.

- [ ] `ipad` The same on the iPad: the marks bar at the bottom in Focus mode.

- [ ] `desktop` In Focus mode, select a passage. The marks bar opens just below the top of the book, below Obsidian's header, in the book's colors, without covering the **×**. Mark the passage; the bar closes.

- [ ] `android` In Focus mode, select a full screen of text and drag the lower handle down. The page stays put, with no upward drift and no shimmer while dragging, and the **×** stays on screen. Release the selection: the page is still right. Turn the page: no leftover offset. Leave Focus mode: reading is unaffected.

- [ ] `each` Select some text and, with it still selected, enter Focus mode. The selection is cleared, the marks bar closes, and the book lands cleanly on a page, not part-way between two. Select text in Focus mode and leave it: the same — the selection is cleared and the page lands cleanly.

---
## Two panes on the desktop

- [ ] `desktop` In Focus mode, Obsidian's header above the book still works and is not covered by it: open its **⋯** menu, and the menu shows over the book with the book's own items, such as **Show reading data**.

- [ ] `desktop` With the book in Focus mode, switch to another tab and back. The book is still in Focus mode.

- [ ] `desktop` With the book in Focus mode, open another file in the same tab from the file list, then select the header's **←** to come back. The book opens out of Focus mode: Focus mode is not remembered when a book is opened again.

- [ ] `desktop` Split the workspace and open a book in each pane. Put both in Focus mode, then leave it in one. The other stays in Focus mode, and nothing of Obsidian's appears or disappears in it.

---
## Clean up

- [ ] `once` Leave Focus mode. In **Display style → Theme**, set **Reader theme** back to **Match light or dark mode** and brightness to 100%.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
