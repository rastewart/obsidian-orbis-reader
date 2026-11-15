# Test plan — Search

← [Design Docs](../README.md)

Searching the open book: the search bar, the Navigator's **Search** tab, landing on a result, **Advanced search** with its scopes, **Filter by mark** and match options, results in notes, and clearing a search. What a user sees is in the guide: [Search](../../guide/search.md).

**Not here:** looking a selected word up ([Look-up](../../guide/look-up.md)), the search bar in Focus mode ([Focus mode](focus-mode.md)), and Obsidian's own vault search. Each belongs elsewhere.

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

- [ ] `once` Open `annotation-workhorse.epub`. Delete `fixtures/!orbis-data/annotation-workhorse.epub.orbis` first if an earlier run left marks in it.

- [ ] `once` Mark three passages that contain the word **kettle**: one **Key point**, one **Quote**, and one with a note whose text is **lighthouse**, with no mark. The word *lighthouse* appears nowhere in the book, so a result for it can only come from the note.

- [ ] `once` In **Settings → Orbis Reader → Reading behavior**, **Flash book text for navigation and search results** is on.

---
## The search bar

- [ ] `each` Select **Search in book** on the toolbar. A search bar opens between the toolbar and the page, with its field ready for typing, and the toolbar's magnifying glass stays lit.

- [ ] `each` Type **kettle** and press **Enter**. The book goes to the first result straight away. The count between the arrows reads **1 / N**; while the book is still being read it ends in **+**, and the total grows until the **+** goes. The kind icon beside the count is the one for book text; on the desktop, hovering it shows **Book text**.

- [ ] `each` Select **↓** a few times, then **↑**. The reader turns to each result and back, and the count follows.

- [ ] `each` With the query unchanged, press **Enter** again. It goes to the next result rather than searching again.

- [ ] `desktop` With the insertion point in the search field, **Down** and **Up** step to the next and previous result, the same as the buttons. Select the book and they no longer do: there the arrows belong to the book.

- [ ] `each` Change the query to **Kettleby** and press **Enter**. The new results replace the old ones, and the count starts again.

- [ ] `each` Select the magnifying glass again. The bar closes and the result highlights go.

- [ ] `each` Select a chapter on the **Contents** tab so **←** shows at the top right of the page, then select **Search in book**. While the bar is open, **←** is hidden. Close the bar: **←** is back at once, in the same place.

- [ ] `desktop` Open the bar, search for something, and press **Escape** in the field. The bar closes and the highlights go.

- [ ] `each` Search for **zzzq**. The count reads **0**.

---
## Landing on a result

- [ ] `each` Search for **kettle**. Arriving at a result, the passage flashes briefly. The result you are on is amber; other results on the same page are cyan.

- [ ] `once` Turn **Flash book text for navigation and search results** off and step to the next result: no flash, and the amber and cyan still show. Turn it back on.

- [ ] `each` Step to a result inside the passage you marked **Key point**. The passage keeps its own mark's look, with the search's amber drawn over it. Close the search: the amber goes and the mark is as it was.

---
## The Search tab

- [ ] `each` Open the Navigator and its **Search** tab. Type **kettle** and press **Enter**. The results are listed under headings in reading order, each heading with its number of results in brackets, and each row shows the match in its context with the match itself highlighted. The headings are the chapters on the **Contents** tab — **A HOME BY THE WEIR**, **THE FIRST LANTERN** and so on — not the book's title over everything.

- [ ] `phone` On the **Search** tab, the field and the sliders button beside it fit across the Navigator: the field's right edge and the whole sliders button are on screen, and nothing scrolls sideways. Type a long query, such as **the kettle by the weir at night**: the field scrolls its own text, and the sliders button stays where it was.

- [ ] `each` Select a row. The Navigator closes, the search bar comes back with the same query, and the reader goes to that result. Step on from there with **↓**.

- [ ] `once` Back on the **Search** tab, delete the text in the field. The list empties.

- [ ] `once` With results showing in the search bar, delete the query's text in the bar's field. The bar stays open and the results stay, so you can step through them; retype the query and nothing is lost.

- [ ] `desktop` On the **Search** tab, **Down** from the field moves into the list, **Up** and **Down** walk it, and **Up** from the top row goes back to the field.

- [ ] `desktop` On the **Search** tab, move **Down** to a result and press **Enter**. The Navigator closes, the book goes to that result and it flashes, and the insertion point is in the search bar's field: **Down** and **Up** step on through the results from there.

- [ ] `mobile` On the **Search** tab, select a result. The Navigator closes and the book goes to it, and the on-screen keyboard does not come up over it.

- [ ] `each` With **kettle** searched for in the search bar, open the Navigator: the bar closes. Close the Navigator by selecting the page beside it: the search bar comes back on its own, with **kettle** in its field and its results still counted.

---
## Advanced search

- [ ] `each` Select the sliders button beside the search bar's field. **Advanced search** opens with three sections: **Search in**, **Filter by mark** and **Match**. **Book text** is the only scope on, and the sliders button is not lit.

- [ ] `each` With **Book text** the only scope on, its button is dimmed and cannot be pressed, and below the scopes it says **At least one place to search must stay on.** Select **Passage selections** to turn it on: **Book text** can be pressed again, and the line goes. Select **Book text** to turn it off. **Passage selections** is the only scope on, and it is now the dimmed one.

- [ ] `each` Select **OK**. The sliders button is lit. Search for **kettle**: only the two marked passages come back, quickly, with the kind icon for a passage selection beside the count. Stepping to each one goes to the start of the marked passage and flashes the whole of it, not only the word.

- [ ] `each` Open **Advanced search** again, and turn on **Note selections** and **Note text** as well. Select **OK** and search for **lighthouse**: one result, with the note-text icon. Selecting it opens the note, with **lighthouse** marked inside it, and the book goes to the passage it is attached to.

- [ ] `each` Search for **kettle** with all four scopes on. **Enter** goes to the first result in reading order, **1 / N**: the book-text match in **Kettleby** in the opening paragraph, not the marked passage below it. Book text and the saved items come back together, in reading order, each row on the **Search** tab labeled with its kind, and the icon beside the count changes as you step between kinds.

- [ ] `each` In **Advanced search**, under **Filter by mark**, it reads **Any mark.** Select **Select marks**: the list holds **Key point**, **Quote** and **Unmarked notes**, each with how many saved items carry it, and no mark that nothing in the book uses. Pick **Quote**, then **OK**, and search for **kettle**. The only saved item in the results is the Quote passage. Every book-text match still comes back too, because **Book text** is still on and the filter does not apply to book text, so **Enter** still lands on the **Kettleby** match first.

- [ ] `each` With **Quote** still the filter, clear the query and select **OK** in **Advanced search** again. With nothing typed, it lists every saved item marked **Quote**.

- [ ] `each` Change the filter to **Unmarked notes** and search for **kettle**. The only saved item in the results is the note; the book-text matches still come back with it.

- [ ] `each` With a mark still picked, turn every scope off but **Book text** and select **OK**. **Filter by mark** was dimmed with the mark still showing, and the sliders button is not lit. Open **Advanced search** and turn **Passage selections** back on: the mark is still picked, and the button lights again after **OK**.

- [ ] `once` Under **Match**, turn **Match case** on and search for **Kettle**: every result is *Kettleby*, and none is the lower-case *kettle*. Turn it off and **Whole word** on, and search for **kettle**: every result is the word *kettle*, and none is *Kettleby*.

- [ ] `once` Change something in **Advanced search** and select **Cancel**. Nothing has changed — the scopes, the filter and the options are as they were, including a mark picked on the way.

- [ ] `once` With results showing, change a scope in **Advanced search** and select **OK**. The old results are cleared, the query stays in the field, and **Enter** runs it under the new settings.

- [ ] `once` With a scope, a mark filter and **Match case** set, close the book's tab and open the book again. **Advanced search** is back to book text alone, with no filter and no match options, and the sliders button is not lit: the settings last only while the book stays open.

- [ ] `once` Set them again, then open another book in the same tab from the file list. The same: **Advanced search** starts from book text alone for the new book.

---
## Clean up

- [ ] `once` Close the search bar. Delete the three marks made in Setup, or delete `annotation-workhorse.epub.orbis` if the next run should start clean.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
