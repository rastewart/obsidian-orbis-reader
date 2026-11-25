# Search

← [User Guide](README.md)

---

## Overview

Search finds text in the book that you have open. It can also search the passage selections and annotation notes that you saved in that book.

Search does not search your vault. To search the vault, use Obsidian's search.

---

## Search the book

1. On the toolbar, select **Search in book** (the magnifying glass icon). You can also run **Open search** from the command palette. The search bar opens under the toolbar.
2. Type your query.
3. Press Enter.

The reader goes to the first result as soon as Search finds it. Search continues through the book, and the count of results increases.

To go to the next result, press Enter again without changing the query.

For the controls on the search bar, see [The search bar](#the-search-bar). For how the book highlights the results, see [Results in the book](#results-in-the-book).

---

## Go through the results one at a time

On the search bar, do one of these:

- To go to the next result, select **Next result** (the down arrow) or press the Down arrow key.
- To go to the previous result, select **Previous result** (the up arrow) or press the Up arrow key.

The reader turns or scrolls to each result.

---

## See all the results in a list

1. On the toolbar, select **Navigator**.
2. Select the **Search** tab.
3. Optional: Type a query and press Enter.
4. Select a result.

The Navigator closes, the reader goes to the result, and the search bar opens again. You can then go through the results from the search bar. On a desktop, the query field of the search bar is selected, so the Up and Down arrow keys go through the results. On a phone or tablet, the query field is not selected, so the on-screen keyboard does not open.

To move through the list with the keyboard, press the Down arrow key in the query field. Up and Down then move through the list. Press Up on the first result to go back to the query field.

For how the list shows the results, see [The Search tab](#the-search-tab).

---

## Read a note that matches

1. Search with **Note selections** or **Note text** under **Search in**. See [Use Advanced search](#use-advanced-search).
2. In the **Search** tab of the Navigator, select a note result.

The note opens, with the matching text highlighted. The reader also goes to the passage that the note is attached to. A match in a note's text is not in the book, so you can see it only in the note.

---

## Close a search

Do one of these:

- On the toolbar, select **Search in book** again.
- In the query field, press Escape.
- In Focus mode, select the Close button at the right end of the search bar. The toolbar is hidden in Focus mode.

Closing the search clears the query, the results and the highlights.

A new search replaces the results and highlights of the previous search.

---

## The search bar

From left to right, the search bar has the query field and these controls:

| Control | What it does |
|---|---|
| **Advanced search** | Opens the **Advanced search** dialog. The button is highlighted when any setting in it is not the default |
| **Previous result** | Goes to the previous result |
| Kind icon | Shows the kind of the current result: book text, a passage selection, a note selection or note text |
| Count | Shows the result you are on and the number of results, for example `3 / 14`. A **+** at the end shows that the search is still running. `…` shows that no result is found yet. `0` shows that there are no results |
| **Next result** | Goes to the next result |

The **Search in book** button on the toolbar is highlighted while the search bar is open.

The search bar and the Navigator do not show at the same time. When you open one, the other closes.

When you delete text in the query field of the search bar, the results do not change. The results and highlights stay until you run a new search or close the search bar. When you delete all the text in the query field of the **Search** tab, the results and highlights are cleared.

---

## Results in the book

When you go to a result, the book shows it in these ways:

| Highlight | What it shows |
|---|---|
| Flashing text | The passage flashes briefly when you go to it. To turn this off, disable **Settings → Orbis Reader → Reading behavior → Flash book text for navigation and search results** |
| Amber | The result you are on |
| Cyan | The other results in the same chapter, so you can see if the next result is near |

Results are highlighted on each page as you go to them.

Search does not change the colors of your own annotations. The search highlights show on top of your passage selections, and they are removed when you close the search.

---

## The Search tab

The **Search** tab of the Navigator lists all the results, in reading order. To open it, see [See all the results in a list](#see-all-the-results-in-a-list). The results are grouped by chapter, with the number of results for each chapter. For example:

```text
Chapter One (3)
  …the fox jumped over the…
  …over the lazy dog and…
Chapter Three (1)
  …a fox is sly by nature…
```

Each row shows the matching text in context, with the match highlighted. A result from your annotations also shows a label with its kind.

---

## Advanced search

Advanced search sets where Search looks, which marks the results can have, and how text is matched.

### Use Advanced search

1. On the search bar, select **Advanced search** (the sliders button to the right of the query field).
2. Under **Search in**, select the places to search.
3. Optional: Under **Filter by mark**, select **Select marks**, select the marks, and then select **Done**.
4. Optional: Under **Match**, select **Match case** or **Whole word**.
5. Select **OK**.
6. Press Enter in the query field to run the search.

The **Advanced search** settings apply to the next search that you run. To discard your changes, select **Cancel**.

If you set a mark filter and the query field is empty, **OK** runs the search. The results are all the annotations with those marks.

If you change the settings while results show, **OK** clears the results. The query stays in the field. Press Enter to run the search again.

### Places to search

Under **Search in**, you can select any combination of these places. At least one must stay selected.

| Place | What it searches |
|---|---|
| **Book text** | The text of the book |
| **Passage selections** | The text of your passage selections |
| **Note selections** | The passages that your annotation notes are attached to |
| **Note text** | The text that you wrote in your annotation notes |

A search without **Book text** is faster, because Search does not read the whole book.

A passage selection or note selection result goes to the start of the saved passage, not to the matching word. The reader flashes the whole passage. If the passage continues on the next page, turn the page to see the matching word. You can also select **Book text**. Search then finds the same word as a book text result, which goes to the exact word.

Your **Advanced search** settings stay until you close the book.

### Filter by mark

**Filter by mark** limits the passage selections and notes in the results to the ones with the marks that you select. It does not filter book text, because book text has no marks: when **Book text** is selected, every match in the book text is still in the results. To see only the passage selections and notes with those marks, turn off **Book text**. **Select marks** opens a list of the marks used in this book. Each mark shows the number of annotations that have it.

- The list shows only the marks that annotations in this book use.
- **Unmarked notes** is in the list. Select it to find the notes that have no mark.
- If you select no marks, the results include any mark.

The list includes a mark that is hidden in your preset, if annotations in the book still use it.

When **Book text** is the only place selected, **Filter by mark** is dimmed. The marks that you selected stay, but they do not filter the results, and they do not highlight the **Advanced search** button. They filter again when you select another place.

### Match options

| Option | What it does |
|---|---|
| **Match case** | Finds only text with the same capitalization. Disabled by default, so `fox` finds *Fox* |
| **Whole word** | Finds only whole words. Disabled by default, so `fox` finds *foxes* |

Both options apply to the book text and to the text of your annotations.

---

## Searching a long book

Search covers the whole book, not only the current chapter. The results are in the order they appear in the book.

A long book can take a few seconds to search. You can go through the results before the search is complete.

A very short query can find many results, and it is slower on a long book.

---

## See also

- [Reading a Book](reading-a-book.md): describes the toolbar, the Navigator and the flash setting
- [Marks and Notes](marks-and-notes.md): describes the passage selections and notes that Search can search
- [Annotations and Presets](annotations-and-presets.md): describes the marks that **Filter by mark** shows
- [Look-up](look-up.md): finds definitions, vault notes and web results for text that you select
