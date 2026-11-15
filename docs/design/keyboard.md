# Reading with the keyboard

← [Design Docs](README.md)

Orbis is touch-first. On a desktop, the commands here let a reader turn pages, select, mark and move between
annotations without leaving the keyboard.

---

## Hotkeys inside the book

**The book is an iframe, and a keystroke inside one never reaches the document Obsidian listens on.** Without help,
every hotkey — this plugin's, Obsidian's, all of them — stops working the moment you click into the text.

Re-dispatching a copy of the event onto the outer document is not enough: **Obsidian ignores a synthetic keyboard
event.** A test with focus on the host passes either way, because there the event is native.

So the plugin reads the bindings and calls the command itself: `hotkeyManager` and `commands` for the reaching-in
part, `hotkey-match.ts` for the matching, which is pure and tested. Three things that module has to get right:

- **`Mod` is Cmd on macOS and Ctrl elsewhere**, and modifiers must match *exactly* — `Ctrl+S` must not fire on
  `Ctrl+Shift+S`, which is somebody else's binding.
- **The character is not the key.** On macOS Option+S produces `ß`, while the binding was stored as `S`. `e.code`
  carries the physical key, so both are offered.
- **A hotkey you cleared stays cleared.** An emptied custom binding must not fall back to its default.

Three deliberate limits on what is looked at in the first place: a bare letter is ignored (leaning on the keyboard
inside a book should not fire commands), anything typed into a form field in the EPUB stays there, and a modifier
pressed alone is not an event. The re-dispatch is kept after the direct call as a last resort for anything else
that listens.

---

## Nothing is bound by default

Obsidian's contract is that the reader binds keys, and a plugin claiming a combination is a bug to the very
people this is for. Every command ships unbound.

**One exception, and it is not a chord**: the reading keys turn the page inside the book without being bound —
`←` `→`, space, Page Up/Down. Someone who presses the right arrow in a book expects the page to turn and has no
way to discover it wants configuring first. It claims no modifier, applies only while the reader is focused, and
a setting turns it off. `↑` `↓` are left out on purpose: in a scrolled book they scroll, which is what a reader
wants from them.

---

## Focus, which is most of the difficulty

Focus lives in **three** places — the book's own document once it has been clicked, the host element around it
before that, and the annotation bar, which takes focus the moment a selection raises it and is appended to
`document.body`, outside this view altogether. Handling only one of them is the usual way for a key to stop working.

So the reading keys are listened for on the **document**, guarded so they act only when this reader is the active
view and the keystroke is not going into a field somebody is typing in. A listener on the host would miss every
keystroke made while a selection is showing — which is exactly when a reader wants to refine one.

That listener is installed **once per view, not once per file load**: `registerDomEvent` lives as long as the view,
so installing it per load would stack a listener for every book opened in the pane.

- **The host takes focus when a book opens**, so the first arrow press turns the page instead of reading as broken.
  `tabindex="-1"` makes it focusable without putting a reading surface in the tab order. It is focused only when
  its pane is the active one, so a book opening in the background cannot pull the keyboard out of what you are
  typing.
- **Navigating hands the keyboard back to the book.** Closing a panel returns focus to the control that opened it,
  which is right on Escape and wrong when the panel closes because you jumped somewhere: Tab would walk the toolbar
  instead of entering the chapter you reached. `close()` takes a reason; the navigating paths pass it, as do the
  history arrows and the Go To bar — the latter only on success, so a rejected location keeps the field.
- **The `‹ ›` arrows are out of the tab order.** They sit in the outer document and would answer the first two
  presses of Tab before the book saw one. For a keyboard reader they duplicate a key that already turns the page.

### The toolbars are a grid

`reader/toolbar-keys.ts`. The main toolbar, the Display style tabs, the open tab's controls, the search or Go to
bar and the Listen bar are **rows**, top to bottom as they are on screen, and none of them gives its keys to the
book: an arrow on a toolbar control never turns the page.

- **Left and right** move along a row, wrapping; **Home** and **End** go to its ends. **Up** lands on the button
  that opened the row being left (`opener`); **down** lands on the row's starting point (`entry` — the open tab) or
  its first control. `nextStop` is pure and decides all of it.
- **A slider, a number field or a dropdown keeps its arrows.** They are how it is used; Tab moves off it. Taking
  them would leave Margins with no keyboard at all.
- **Escape from any row puts the keyboard on the book**, as it does from the content panel and from a dialog.
- **A mouse click hands the keyboard back to the book** (desktop only), so the arrows turn the page after
  selecting Bookmark, Toggle note icons or a tab. A click made with Enter or Space is told apart by its `detail`
  of 0 and leaves focus on the control; so does one that moved focus somewhere it is needed — a search field, the
  content panel, a dialog.
  A bar that takes the keyboard when it opens has to be told which: the Listen bar opens asynchronously, after the
  click has already put the keyboard on the book, so `TtsController.toggle(focusBar)` carries the answer through
  and the bar takes focus only when opened from the keyboard.
- **Closing the Display style menu moves focus only to rescue it.** From inside the menu — Escape, or a toolbar
  shortcut — the keyboard would be lost as the menu hides, so it goes to the book. Closed by selecting another
  toolbar button (which closes the menu as a side effect), it stays on that button: Enter on Bookmark used to land
  on Display style instead.
- **Where focus goes is logged** on the `nav` pill (`focus → button.orbis-ctrl-btn`), for tracing a jump nobody
  asked for.

---

## Links: Tab seeds, then roams

Tab steps through a book's links natively — anchors are focusable, and foliate pages to whatever gains focus. But
native Tab resumes from wherever focus is, and from nowhere it starts at the top of the document, which would throw
a reader deep in a chapter back to its first link.

The first press **seeds** from what is visible — the first link on the page, the last when tabbing backwards — and
after that does nothing, leaving Tab to step natively through the section. Tab is not locked to the page: reaching
a link two pages on should not require turning the pages first.

Seeding triggers on *the focused element not being on screen*, which covers a second case with the same rule:
focus survives a page turn, so arrowing forward leaves it on a link several pages behind.

**The visibility test is the part worth knowing.** Asking whether a link falls within the iframe's viewport is
always true: foliate lays a section out in CSS columns and then expands the iframe to the width of all of them,
scrolling a container outside it. The frame's own rect carries the
scroll — it slides negative as the container scrolls — so adding it to the element's position gives an
outer-document coordinate that can be compared with the reading area.

---

## Selection: by the sentence

**There is no caret to extend from.** An iframe with no `contenteditable` has no insertion point, so Shift+Arrow
does nothing at all in a book, and caret browsing is off by default on Windows and absent on macOS. Imitating a
caret would also be the wrong shape: on a phone there will never be one, and a reader marks passages rather than
characters.

So the unit is the sentence, which the book can enumerate for itself. `getReadingUnits` does exactly that for the
audio — one unit per sentence, each with a text-node Range, via `Intl.Segmenter` — and a sentence is the same thing
whether it is being spoken or marked.

**The selection is the state.** Nothing is remembered between calls; which sentence you are on is read back from
the live selection each time, so a page turn, a re-render or a click elsewhere cannot leave a cursor pointing at
something that has gone. A selection the reader cannot see is treated as not where they are.

### One command, three states

"Select this sentence" and "select next" are one command, because the difference is too fine to keep in a hotkey
list. They merge on one rule: **a caret is a position, not a selection.**

| you are… | Select sentence gives you |
|---|---|
| nothing selected | the first sentence on the page |
| a caret in a sentence (you clicked) | **that** sentence |
| a sentence already selected | the next one |

Seed, then walk. `Select paragraph` works the same way, taking the run of sentences sharing a block and moving on
when that block is already selected whole — which is vim's real idea, that a sentence and a paragraph are things
you can take hold of, without any of its keys.

### Shift+arrow

`Selection.modify` is what makes it possible: the browser will not extend a selection with the arrows in a
non-editable document, but it will do it on request. It moves the **focus** end, so Shift+Right grows and
Shift+Left then shrinks, exactly as everywhere else. `left`/`right` rather than `forward`/`backward`, because the
visual directions respect right-to-left text and foliate reads RTL books.

**It starts a selection as well as refining one**, because no editor has a "begin selecting" key — you hold Shift
and move, and the selection exists because you did; a separate command first would be a mode nobody can see. A
first press takes the sentence at the caret, or the first on the page, whole and without applying the
direction: you have to see what you got before adjusting it.

**A caret means two opposite things**, and only we can tell them apart. Clicked in a sentence, it means "take this
one"; shrunk down to nothing with Shift+Left, it means "keep going, out the other side" — the focus end crossing
the anchor and the selection growing backwards, as an editor does. The DOM cannot distinguish them, so where the
last adjustment left the caret is remembered, and it self-corrects: click elsewhere and the position no longer
matches.

**The invisible caret sits at the end.** `addRange` leaves a selection directionless and Chromium settles that on
the first `modify`, so the keys would mean different things depending on which one you pressed first.
`setBaseAndExtent` names the anchor and focus outright.

**And Chromium sometimes refuses to move.** Stepping by `line` stalls at certain boundaries in a multi-column
layout — the line "above" belongs to a fragment the engine will not enter — and it declines silently, so the
selection simply stops growing. The move is checked: if the focus did not shift, the same direction is tried by
paragraph and then by character, which always crosses a boundary.

### Escape, in two stages

An arrow **without** Shift ends a selection, any arrow, and spends its press on letting go — the page turns on the
next one, exactly as an editor puts the caret at the selection's end rather than one character past it. Paging
away is a move you make deliberately.

Escape closes the annotation bar first and clears the selection second: one press never destroys a selection the
reader is still building, and a second never leaves highlighted words with no way to act on them. There is a
`Clear selection` command too, for anyone who wants their own key.

With nothing selected, Escape in the book closes the **Display style** toolbar if it is open, and the Listen bar if
nothing is playing or paused (`closesOnEscape`). Opened with the mouse, either leaves the keyboard on the book (§The
toolbars are a grid), so the book is where the press arrives. A Listen bar with audio in it stays: closing it stops
playback, and Escape is too easy a key for that.

---

## Marks, which is what the selecting was for

`Apply mark 1–9`, and **the number matters more than the name**: a hotkey is a position, so the key that marks a
passage yellow should keep marking it yellow whatever that mark ends up being called. They are numbered by
`barMarks()` — enabled marks in preset order, the same order the annotation bar shows — and reach past the quick
bar, so a book with twelve marks can bind nine rather than only the six on display.

**A mark can land in two places, and the key has to mean the right one in each.** With the note editor open it
chooses that note's mark; otherwise it marks the selection, exactly as clicking the swatch would. The editor wins
when both are live, because it is in front of you and you opened it deliberately. With neither, the command
reports false, so it grays out in the palette rather than appearing to work — and the key is left to whatever else
it was bound to.

The seam is two fields on `AnnotationController`: `notePick`, set while the editor is open and cleared when it
closes, and `quickTarget`, recorded wherever the bar records its own pending range. They are the bar's own state,
exposed rather than reimplemented, so a hotkey and a click cannot disagree.

`Mod+1`–`9` are Obsidian's own tab switches by default. Binding one to a mark is the reader's decision, and their
custom binding wins inside the book exactly as it does outside — `hotkey-match.ts` consults custom bindings before
defaults.

## Moving between annotations

`Go to next / previous mark or note`, and the same pair narrowed to passage marks or to notes. **"Go to" means
what clicking means** — the same `handleShowAnnotation` a tap takes — so a note opens its view and a passage mark
opens the bar in edit mode. A keyboard reader gets the UI a mouse gets, rather than a second one to keep in step.

**What is on screen is the cursor**, as with sentences. The annotation being shown is where you are, so the next
press moves on from it; navigating any other way clears it through `markUserNavigation`, so jumping to chapter one
carries on from chapter one rather than from the annotation last shown. Ordering is `cfiSortKey`, the ordering the
saved panel and the reading records already use, and both directions wrap.

`Delete the selected mark or note` routes a note through the shared confirm and a passage mark straight through,
matching the trash button beside it.

## Rules the code states

- **A stale document does not answer lookups.** A re-rendered section is a new `Document`, and a dead document's
  ranges still resolve perfectly well — against a page nobody is looking at. Detached documents are skipped and
  pruned from `docToSection`.
- **Clearing the selection must not close what was just opened.** `removeAllRanges` fires `selectionchange`, whose
  debounced handler hides the bar — landing *after* the show.
- **A dead key is not a modifier.** On macOS, Option+N produces `key: "Dead"`, and a hotkey bound to it must work
  inside the book as it does everywhere else.
- **Dialogs take the keyboard.** Tabbing off the note editor's textarea lands on a button, which is not a field, so
  the reading keys stay off while a dialog is open.
- **Focus needs somewhere to land, and to be visible when it gets there.** Dialogs trap Tab; the mark swatches,
  whose border and shadow are forced off so the colored dot can carry the whole appearance, draw their ring on the
  dot; choosing from the all-marks list focuses the chosen mark; an arrow through the bar rebuilds it with focus in
  the same position.

## Deliberate limits

- **Crossing a section boundary.** Sentence moves stop at the end of a chapter: the next sentence lives in a
  document foliate may not have loaded yet.
- **Modes and counts.** Vim's power comes from both, and neither survives the transplant: Obsidian's hotkey system
  has no notion of a mode, and a mode with no visible indicator is a trap — you press `→` expecting a page and get
  a selection. A vim-minded reader is better served by binding these commands to whatever keys they like.
