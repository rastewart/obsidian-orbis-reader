# Accessibility

← [Design Docs](README.md)

ARIA patterns, keyboard navigation requirements, color contrast targets, and the Foliate/iframe limitation that
no amount of care on our side can lift.

---

## Scope

### What is audited

- All toolbar buttons (icon-only and labeled)
- Display Style menu: tab bar, drawers, sliders, dropdowns, toggle buttons
- Content panel: tab bar, search input, results list, saved/backlinks/stats tabs
- Annotation popup: color swatches, note/link/delete buttons, color picker
- Focus mode overlay: exit button, progress indicator
- Settings tab: tab bar, all `Setting` components, grids
- Modals: `NotesDiffModal`, `BookExportModal`
- Color contrast: diff legend, annotation highlight swatches, debug panel category labels

### What is out of scope

- **epub/iframe content** — book text rendered by Foliate is inside a sandboxed `<iframe>`. Screen readers cannot enter it. This is an architectural limitation of foliate-js; document it rather than attempting to fix it.
- **Obsidian-native components** — `Setting`, modal scaffolding, and the Obsidian workspace chrome are managed by Obsidian itself.
- **Debug panel** — developer-facing; English-only and screen-reader access is not required.

---

## Keyboard navigation

### Toolbar

All toolbar buttons are reachable by keyboard. Because the toolbar is inside an `<iframe>`-adjacent host element and Obsidian manages the outer focus, these must hold:

1. Tab order through the toolbar buttons is logical (left to right: TOC, Display Style, Search, Bookmark, Note Icons, Progress, Focus Mode).
2. Each button activates on `Enter` and `Space`.
3. When the Display Style menu is open, `Escape` closes it and returns focus to the Display Style button.
4. When the search bar is open, `Escape` closes it and returns focus to the Search button.

### Display Style menu

The three-level hierarchy needs keyboard support:

| Level | Element | Required behavior |
|---|---|---|
| Level 1 | Display Style button | `Enter`/`Space` toggles menu; `aria-expanded` reflects state |
| Level 2 | Tab bar (`orbis-level2-toolbar`) | Arrow keys (left/right) move between tabs per ARIA tab pattern; `Enter`/`Space` activates tab |
| Level 3 | Drawers | Tab cycles through controls; `Escape` closes the whole menu |

The ARIA tab pattern (`role="tablist"` / `role="tab"` / `aria-selected`) applies to the Level 2 tab bar. See [ARIA roles](#aria-roles) below.

### Content panel

The panel tab bar (Contents / Search / Saved / Backlinks / Stats) follows the same ARIA tab pattern. Arrow keys move between tabs; `Tab` moves into the tab panel content. `Escape` closes the panel, as a backdrop click does, and returns focus to the button that opened it.

### Annotation popup

Color swatch buttons are keyboard-reachable. The roles are `radiogroup`/`radio` with `aria-checked`, because that is what they mean — one mark at a time — **but every swatch is its own Tab stop, not a roving one** (`setAllTabStops`).

A roving stop is the ARIA pattern, and it is right in a form, where a labeled row of radios sits among other rows and arrows are the expected way in. It is wrong on this bar: every other button there is a Tab stop, so a swatch that silently is not one reads as the other marks being unreachable, and nothing about a row of icons suggests arrows. The arrow keys still work for anyone who expects them; they are not the only way through. The count is small and bounded by the marks a reader has defined.

Arrows move without selecting; Space or Enter commits. Committing redraws the bar, so selecting on move would mean chasing focus back through a rebuild.

### Modals

`NotesDiffModal` and `BookExportModal` trap focus like every Orbis dialog (see below), and every custom button within them has an accessible name.

---

## Keyboard reachability

`pnpm lint:keyboard` (`scripts/check-keyboard.ts`) fails on a clickable element a keyboard cannot reach: a `div`, `span`,
`li` or href-less `a` that gets a click listener and never gets a `tabIndex` or a key handler. A real `<button>` is
exempt because the browser already makes it operable, and an `a[href]` because the same is true of a link — without those
two exemptions the report would bury the real findings in noise, which is how a linter teaches people to ignore it. It
also fails on a repaint that calls `captureFocus` and never restores it.

Anything that acts on a click is a control and is reachable:

- The Saved panel's bookmark, highlight and note rows, and its collapsible section headers — the panel a reader uses
  most to get back to their own marks.
- The backlinks rows, the `.orbis` data view's location links and note links, the notes-file picker's rows.
- The progress readout in the toolbar and in focus mode, which *cycles* what it shows and is therefore a control.
- The recording-method headers in settings, and the Generate notes dialog's **Advanced** disclosure — both carry
  `aria-expanded`, since a chevron is a picture and the state has to be readable without it.

What is not a control is suppressed with a reason: backdrops, which Escape already dismisses and which would otherwise
become a tab stop between the reader and what they opened, and a click-swallower that exists to stop a switch's click
reaching the row behind it.

**One helper.** `onActivate(el, run)` in `ui-utils.ts` sets `role="button"`, `tabIndex = 0`, the click listener and a
keydown for Enter and Space — with Space prevented from scrolling and Enter from submitting. Every such row uses it,
which is what makes the next row correct by default.

### The focus ring is the theme's

`--background-modifier-border-focus` is what Obsidian rings its own focused controls with; `--interactive-accent` is
what it *fills* a primary button with. All our focus rules use the focus variable, so a button inside an Orbis popup
rings the way the rest of the app does, and the rows `onActivate` makes focusable get the same ring, scoped to our own
surfaces.

**Where our CSS strips Obsidian's ring, we owe one back.** Obsidian rings a focused button with
`box-shadow: 0 0 0 3px var(--background-modifier-border-focus)`, and many of our classes set
`box-shadow: none` in rules that must win over Obsidian's (`:not(#orbis#important)`, see the top of `styles.css`) —
necessary, since Obsidian's default button fill and shadow otherwise fight the flat
icon buttons and pill tabs these are; `.orbis-ctrl-btn` alone is every tab strip, the toolbar, and half the buttons in
the annotation manager. Those classes are listed by name in one place in `styles.css`, with the theme's ring. Listed
rather than
swept with `[class*='orbis-']`, so a class that deliberately carries its ring elsewhere — a swatch, whose ring goes on
the chip inside it — cannot be caught by accident. **A new class that strips the shadow has to be added there**, which
is the same standing obligation as the surface list above.

**Every scroller has to make room for a ring, or inset the ring.** This is the most common cause of a half-drawn focus
rectangle. A scroller clips at its own padding edge,
and `overflow-y: auto` makes the X axis clip too — `visible` computes to `auto` beside it — so a child that runs the
scroller's full width loses the left and right sides of a ring drawn 2px outside it, and the first and last children
lose their top and bottom. Two fixes, and which one is right depends on the child: **`padding: 4px; margin: -4px`** on
the scroller (`.modal-content`, `.orbis-mark-editor-scroll`) keeps the ring outside the control and gives the layout
the padding back, so nothing moves; **`outline-offset: -2px`** on the child suits list rows, where a ring hugging the
row reads better than one in the gutter (`.orbis-toc-panel` rows, `.orbis-mark-pick-row`).

**A row in a scrolling list wears its ring inside.** The default 2px offset puts the ring outside the element, and a
full-width row inside a list that clips (`overflow-x: hidden`, so one over-wide row cannot grow a scrollbar) loses the
left and right sides of it to that clip — a focused row shows a line above and a line below with nothing joining them,
and the last row loses its bottom edge to the foot of the box as well. The content panel's rows and the overflow marks
list use `outline-offset: -2px` for this.

### The cursor is the theme's too

**A control keeps the arrow; only a link takes the finger.** Obsidian's own buttons and icons use
`cursor: var(--cursor)`, which is `default` on desktop, and its links use `var(--cursor-link)`, which is `pointer`.
A theme or snippet that wants the finger on every control sets `--cursor`, and gets it on ours too. Every Orbis rule
uses one of the two variables, never a cursor of its own: `var(--cursor-link)` for text styled as a link (the page
links in the reading-data table), `var(--cursor)` for everything else — toolbar buttons, rows, chips, tiles.
`pnpm lint:a11y` fails on a `cursor: pointer` in `styles.css`.

### The annotation bar is a third shape

Neither a popup nor a modal: a floating toolbar in `document.body`, raised by a selection or by tapping a mark, with
the book's own reading keys live underneath it. Four rules make it usable from a keyboard.

**Who gets the key** — `barOwnsKey` in `reader/bar-keys.ts`, tested rather than left in a condition. The bar as a whole
keeps only Tab: while it stands there unentered, an arrow still lets go of the selection and takes the bar with it,
which is what a reader who has just selected expects. Tab is the exception because Tab is how you get *into* the
toolbar — left to the reader it would seed a link inside the book and swallow the press, and the mark bar and the
look-up bar could not be reached from the keyboard at all. Once focus is on a control inside, that control keeps its
own keys: otherwise arrowing along the marks would reach the page-turn handler as well as the mark walk, and one press
would either clear the selection the bar was raised on or turn the page behind it. Shift+arrow stays the
selection's from anywhere in the bar, which is why the mark walk ignores Shift.

**Standing down is not enough on its own.** Our own listeners honor `barOwnsKey`, but a keystroke made in the bar
still travels up through `document`, where Obsidian dispatches the reader's own hotkeys — so Space would set the mark
*and* turn the page, because Space is bound to a page command. A key the mark group has answered calls
`stopPropagation` as well as `preventDefault`: a binding somebody made in Obsidian's settings can only be stopped by
not letting the event reach it.

**Tab wraps inside it** (`trapTab`), because the bar sits last in `document.body` and Tab off its final button
would otherwise walk into Obsidian's chrome with the bar still open. **Escape** puts the bar away and the selection
with it. **Choosing a mark closes it too**, whether the mark was new or tapped: a bar left over the passage would cover
the change just made. Every close path returns the keyboard to the reading host, but only when the keyboard was in
the bar to begin with: it also hides on a stray `selectionchange` raised while the reader is somewhere else entirely.

**And it shows focus.** Its icon buttons — Copy, Note, Copy link, Look up and Delete — force `box-shadow` off so they
can sit flat on a book-colored bar in focus mode, and `box-shadow` is the very thing Obsidian rings a focused button
with, so they carry the ring back like every class that strips it. A swatch suppresses its own outline so the ring can
go on the visual inside it: the round color dot, the mark chip and the dashed `…` all ring on the visual, at the same
offset, in the reader's bar, the note editor and the mobile drawer alike.

### A dialog keeps its Tab, and its × is part of the loop

`createOrbisPopup` and `OrbisModal` both trap Tab, because Obsidian does not do it for us — without it, Shift+Tab off
the first control walks out into the app behind the backdrop, where the ring is invisible under the dim and the
keyboard is somewhere the reader cannot follow. `trapTab(this.modalEl)` is attached to the dialog element rather than
to the content, deliberately: our × is a sibling of the body, inserted above the heading, so it is inside the loop and
is where a forward Tab off the last control lands.

That × is our own `<button class="orbis-popup-close-btn">`, not Obsidian's `.modal-close-button` — which is a div and
is not keyboard-reachable at all in Obsidian's own dialogs. Ours is reachable and shows a ring: it strips the default
button chrome (so it can be a flat icon), and so carries the ring back itself.

### Before a dialog is handed over for testing

Run this over a dialog before anyone tests it.

**Already true everywhere; nothing to do.** Tab is trapped (`createOrbisPopup`, `OrbisModal`), the dialog takes focus
as it opens so the tab order starts inside it, Escape closes, and the close × is appended LAST in the DOM so it is the
final tab stop rather than the first. (It is `position: absolute`, so its place in the DOM costs its appearance
nothing. "Close" is not what a reader wants offered on arrival, and Escape already covers it.)

**Per dialog, in the order these tend to bite:**

1. **Does anything redraw on a change?** A `render()` that empties its body destroys the control under the cursor.
   It must go through `rebuildKeepingFocus`, and if the rebuild *reorders* anything, those controls need
   `data-orbis-focus` keyed by identity rather than position.
2. **Is every checkbox and radio wrapped in a `<label>` with its text?** This is a standard, not a preference: the
   words beside the box are the same control as the box, so clicking them toggles it and the focus ring goes round the
   pair (`label-focus-ring.ts` gives the label `is-focus-visible` while its input has keyboard focus). A `div` there is a 16px target with dead words next to it. Two rows
   cannot be labels because the row also holds buttons (the glossary's, the EPUB chapter list's); there the box keeps
   its own ring and the text is not a target.
3. **Does every control show a ring?** Check for a class that strips `box-shadow` (that is Obsidian's ring — see
   above); a checkbox or radio inside a `<label>` rings as the pair; a `<summary>` matches none of the button rules;
   row-shaped controls inset their ring; every scroller needs 4px of room.
4. **Does the tab order match the reading order?** It is DOM order, so this is a question about how the dialog is
   built, not about `tabindex`. Read down the screen and Tab in parallel.
5. **Initial focus.** A dialog whose first job is typing should land in that field; otherwise the root is right, and
   the first Tab reaches the first control.
6. **Is any choice offered that would be refused?** Disable it and say why in its accessible name, rather than
   accepting the click and answering with a notice in the corner of the screen.
7. **Should anything line up across rows?** Then the list owns the tracks — nothing content-sized per row.
8. **Icon-only controls have an `aria-label`**, and any fact carried only by a visual (a sample, a color) also lives
   in an accessible name.
9. **On a settings page, is every control inside a `.setting-item`?** Obsidian's settings navigation moves between
   rows, and anything painted loose in the pane does not exist as far as Tab is concerned. A page is rows or it is
   not; a page that mixes rows with loose content skips the loose part in one direction and traps focus in it in the
   other. When a block is too big for a control area, put it in a row's control area anyway
   (`orbis-setting-stacked` + `orbis-stacked-column`, plus `orbis-stacked-full` when the block lays out rows of its
   own) rather than beside it. And inside a row, **be a real control or be skipped**: the `onActivate` pattern that
   works everywhere else in the plugin — a `div` with `role="button"` and `tabindex="0"` — is walked straight past by
   the settings pane. Obsidian's own div-shaped controls (`.modal-close-button`, extra buttons) are not reachable
   there either. A `<button>` is.
10. **Is anything reordered from the keyboard?** Then the list cannot be one of Obsidian's declarative lists, and
    the page has to be imperative — `renderReorderList` is the shared builder. A declarative list rebuilds itself
    after a save and replaces the button being pressed; no focus restore survives that reliably. See
    `docs/design/settings.md` § "A list you reorder from the keyboard cannot be Obsidian's".
11. **A closed fold must actually be closed.** Content inside a `<details>` is hidden by a user-agent rule, which any
    author `display` overrides — and the un-hidden content is still not painted, so nothing looks wrong while its
    controls sit in the tab order invisibly. `styles.css` forces it shut on our own surfaces; the symptom of a fold
    that escapes that rule is Tab stopping dead on a summary *only when it is collapsed*.
12. **Every `<summary>` we style needs `tabIndex = 0`.** A `<summary>` is focusable by nature, but not once we hide
    its marker and draw our own — without the attribute, the fold and every control behind it are out of the
    keyboard's reach.

### What a static check cannot see

Tab **order** is DOM order, and whether that matches reading order needs a person walking each dialog. So does whether
the ring is visible against the surface it lands on, whether Escape and Enter do what a dialog implies, and where focus
goes when a dialog closes. Those are the manual pass, per surface: every `OrbisModal` subclass, every popup, every
`openOrbisDialog` call site. Three things in the code answer questions only driving a dialog from the keyboard can
ask:

- **`trapTab`, and focus taken as the dialog opens.** A popup is appended to `document.body`, so it is last in the
  tab order: with focus left where it was, Tab would walk the whole app before arriving — and the trap holds
  nothing if the dialog never took the keyboard in the first place.
- **`orbisFocus` keys.** Closing a dialog returns the keyboard to the control that opened it, matched by **key** and
  not by element identity, because the surface behind is often rebuilt while the dialog is open: change a voice in
  the picker and the panel that opened it redraws, so the remembered button is detached by the time the picker
  closes. Matching by element works when nothing changed and lands nowhere after a change — not a defect a reading
  of the code finds.
- **Folds that look shut but are open to Tab** (point 11) and **styled `<summary>` elements without a tab stop**
  (point 12) — each hides every control behind it from the keyboard while nothing looks wrong.

The checklist is the standing form for a *new* dialog: the questions are cheap to ask while building and expensive
to discover afterwards.

---

## ARIA roles

### Toolbar buttons (icon-only)

Icon-only toolbar buttons are named with `aria-label`, not `.title`. `.title` is a weak accessible name — screen readers may not surface it consistently, and it does not satisfy the ARIA requirement for a named interactive element.

**Do not keep `.title` beside it.** Obsidian draws its own tooltip from `aria-label`, so an element carrying both shows two boxes of the same sentence at once, one styled and one native. Anywhere the pair would be set, the `.title` is the one to drop, and any words it carried that the `aria-label` lacks move into the `aria-label`. An element with a `title` and no `aria-label` draws one native tooltip, which is not a duplication bug.

| Button | Property | Value |
|---|---|---|
| TOC | `aria-label` | `'Contents, search & saved'` |
| Display Style | `aria-label` | `'Display style'`, with `aria-expanded` |
| Search | `aria-label` | `'Search in book'` |
| Bookmark | `aria-label` | `'Bookmark this page'` / `'Remove bookmark'` (dynamic) |
| Note icons | `aria-label` | `'Toggle note icons'` |
| Focus mode | `aria-label` | `'Focus mode'` / `'Exit focus mode'` (dynamic) |
| Debug | `aria-label` | `'Toggle debug log'` |
| Search prev | `aria-label` | `'Previous result'` |
| Search next | `aria-label` | `'Next result'` |
| Search close | `aria-label` | `'Close search'` |

### Display Style menu roles

```
orbis-level2-toolbar           role="tablist"  aria-label="Display style options"
  orbis-display-tab-btn[theme]   role="tab"  aria-selected aria-controls="orbis-drawer-theme"
  orbis-display-tab-btn[layout]  role="tab"  aria-selected aria-controls="orbis-drawer-structure"
  orbis-display-tab-btn[font]    role="tab"  aria-selected aria-controls="orbis-drawer-font"
  orbis-display-tab-btn[spacing] role="tab"  aria-selected aria-controls="orbis-drawer-spacing"

orbis-level3-drawer[theme]     role="tabpanel"  id="orbis-drawer-theme"
orbis-level3-drawer[structure] role="tabpanel"  id="orbis-drawer-structure"
...
```

The drawers have no icon-only buttons: every control has a visible label. An on/off setting, such as **Two-column layout** or **Bold text**, is Obsidian's switch (`ToggleComponent`), whose checkbox carries the setting's name as its `aria-label`. An icon-only toggle button would need its name in `aria-label` and its state in `aria-pressed`, never Active/Inactive in the name.

### Content panel tab bar

```
panel-tabs-container   role="tablist"  aria-label="Content panel"
  tab-btn[contents]    role="tab"  aria-selected aria-controls
  tab-btn[search]      role="tab"  aria-selected aria-controls
  tab-btn[saved]       role="tab"  aria-selected aria-controls
  tab-btn[backlinks]   role="tab"  aria-selected aria-controls
  tab-btn[stats]       role="tab"  aria-selected aria-controls
```

### Annotation popup color picker

```
mark row          role="radiogroup"  aria-label="Mark"
  swatch-btn      role="radio"  aria-label="[mark name]"  aria-checked
```

**Names, not colors.** A swatch is named for the mark it applies, because two marks can share a color and differ
only by treatment, so a color name identifies nothing. The × swatch takes `presets.no_mark` — *Unmarked* — the same
word the Saved panel's no-mark swatch uses, and the group is labeled `annotation_picker.mark` rather than after a
color.

Implemented in three places — the desktop text-selection picker, the mobile highlight drawer, and the note editor popup's own color row — each with its own `role="radiogroup"` wrapper, `aria-checked` synced on selection, and `ArrowLeft`/`ArrowRight` navigation (see [Annotation popup](#annotation-popup) for what an arrow does and does not commit).

---

## `.title` → `aria-label` migration

No interactive element has `.title` as its only accessible name: each carries an `aria-label`, and `pnpm lint:a11y` (`scripts/check-a11y.ts`) fails on a new one that does not, against the baseline in `scripts/a11y-audit-baseline.json`. The toolbar buttons live in `OrbisReaderView.ts`, the annotation-popup buttons (note, copy link, delete, swatches, close ×) in `src/reader/AnnotationController.ts`, and the link-preview affordances in `src/reader/LinkPreview.ts`.

Three cases need more than a label:

- **Display Style tabs** (`display-menu.ts`, via `addTab` — Theme, Layout, Spacing, Font) have visible text, which already names them for a screen reader. They carry an `aria-label` anyway, because Obsidian's hover-tooltip UI reads the nearest ancestor's `aria-label` rather than the native `title`: without one on the tab, hovering it shows the tab bar's tooltip ("Display style options") instead of the tab's own name.
- **Switches** in the drawers (**Two-column layout**, **Bold text**) are named for the setting on their checkbox, and the checkbox's own checked state carries on or off, rather than Active/Inactive in the name.
- **The panel close button** is labeled `Close panel`, and its × character is hidden from screen readers with `aria-hidden="true"`.

**A tooltip is a label, not a `title`.** A `title` is drawn by Chromium, as macOS draws it, beside the pointer, and a
large pointer covers it; nothing in a page can move it. An element carrying both shows two tooltips at once. So a
control's tooltip comes from its `aria-label` — Obsidian's tooltip, which Orbis can place (`tooltip-gap.ts`, below).
A `title` stays only where a label would take something from a screen reader: the two progress readouts, whose
changing text is announced; a linked-note row, whose tooltip is its path; and Recordings' *Use for listening* rows,
whose tooltip would replace the recording's name.

### Tooltip distance

Obsidian draws a tooltip 8px below its control and reads the gap from the control's `data-tooltip-gap` as the pointer
arrives. A page cannot learn the pointer's size, so the distance is the reader's to set: **Settings → Appearance →
Tooltip distance**, a per-device slider from 8 to 64px, with a **Sample** to hover beside it. One capture-phase
`pointerover` listener, ahead of Obsidian's on the body, gives whichever Orbis control the pointer reaches the gap,
and removes it at 8, so a reader who leaves the setting alone sees Obsidian's spacing exactly. Orbis's surfaces only;
desktop only. Dialogs register their own window as they open: Settings can sit in a window of its own, and a dialog
opened from it lands in that window's body, outside the settings page the listener was on.

**Only a tooltip the pointer can reach gets the gap.** A pointer hangs down and to the right of where it points, so
a tooltip placed below or to the right can be under it, and one placed above or to the left cannot.

**A disabled control's tooltip moves clear of the pointer.** Its pointer is macOS's "not allowed" one, whose badge
hangs further below the arrow than the gap reaches — over the tooltip that says why the control is off. The same
pass places it **above** where there is room, else **left** where it fits, else leaves it below (only in a top-left
corner). Above is preferred because Obsidian keeps an above or below tooltip on screen sideways and nothing keeps a
left one on screen. Sizes are estimated from the label against Obsidian's tooltip (300px at most); a placement a
control chose itself is left alone, and one this pass chose is taken back when the control is enabled again.

---

## Color contrast

Minimum target: WCAG AA (4.5:1 for normal text, 3:1 for large text and UI components).

### Specific surfaces

**Diff modal legend** (`.orbis-diff-legend-removed`, `.orbis-diff-legend-added` in `styles.css`)

The text is `var(--text-normal)` on a translucent red or green background that matches the diff rows below it, and removed text is also struck through, so removed and added are not conveyed by color alone (WCAG 1.4.1 Use of Color).

**Annotation highlight swatches**

Highlight colors are user-selected and applied directly to epub text. They are user-controlled and cannot be enforced; this is a stated limitation.

**Known, accepted limitation — note editor's "no highlight color" swatch**

Obsidian's tooltip UI suppresses the hover tooltip for whatever swatch is currently `aria-checked="true"`. The note editor's color row defaults to "no highlight color," so on a freshly opened popup that swatch shows no tooltip until a different color is picked (which flips its `aria-checked` to `false`). Accepted as-is: the accessible name (`aria-label`) is unaffected and always available to screen readers: only the supplementary mouse-hover tooltip is momentarily absent for the one default swatch.

**Debug category labels**

Debug panel uses `var(--text-muted)` and `var(--text-faint)` — Obsidian's own variables. These will inherit whatever contrast the active Obsidian theme provides; no action required.

---

## Focus management

### Opening the content panel

When `openPanel()` is called:
1. Move focus to the panel's search input (if `tab === 'search'`) or to the close button otherwise.
2. Trap focus within the panel while it is open (the panel is a side drawer, not a modal, so a full trap is optional — but focus must not escape to the book iframe behind the panel).

### Opening the Display Style menu

When `openDisplayMenu()` is called:
1. Move focus to the first tab in the Level 2 tab bar.
2. Trap focus within the menu (Level 2 + active Level 3 drawer).
3. `Escape` closes the menu and returns focus to the Display Style button.

### Opening the annotation popup

When the annotation popup appears after a text selection:
1. Focus moves to the picker itself (`#orbis-picker`, `tabIndex = -1`: focusable, not tabbable). It does not land on a mode-specific button such as the note button or the first swatch, because Obsidian suppresses the hover tooltip for whatever element holds focus, and that button's tooltip would never show for a mouse user.
2. There is no close button. The picker closes when the selection is cleared — by selecting elsewhere, or with `Escape`, which clears the selection too and returns the keyboard to the book (`hidePicker`). While the picker is up, Tab stays inside it (`trapTab`).

**Mobile is the exception**: `openHighlightDrawer()` deliberately does *not* call `.focus()` on anything. Calling it (even on the drawer's own close button) right after a touch text selection settles makes the native selection handles appear and then immediately vanish — focusing an outer-document element interrupts the WebView's in-progress text selection. The drawer's buttons still carry correct `role`/`aria-label`/`aria-checked` for VoiceOver/TalkBack to announce as the user swipes to them; they just aren't pre-focused on open the way the desktop picker's are.

### In settings, a control must live inside a `.setting-item`

Obsidian's settings pane moves focus row to row itself — rows with `tabindex="-1"` receive focus, which native Tab
cannot do — so a control drawn outside a row is unreachable by keyboard however focusable it is in its own right. See
[Everything a keyboard can reach lives in a `.setting-item`](settings.md#everything-a-keyboard-can-reach-lives-in-a-setting-item).

### A key handler that acts must prevent the default

A handler that acts on Enter and leaves the default action in place lets the browser act too — and if the handler
repainted, the browser acts on whatever now holds focus — a search dialog can dismiss itself this way. See
[A key handler that acts must `preventDefault()`](dialog-system.md#a-key-handler-that-acts-must-preventdefault).

### Closing a dialog that was opened from a list

Obsidian restores focus to whatever was focused when the dialog opened, and it does that *after* `onClose`. So a
list must not rebuild itself while the editor it opened is closing — the element the host is about to restore to
would be gone, and focus falls to `<body>`. Defer the rebuild by a macrotask and key the row's pencil; see
[A child dialog's Save must not rebuild the list it opened from](dialog-system.md#a-child-dialogs-save-must-not-rebuild-the-list-it-opened-from).

### Focus mode

When focus mode activates:
1. Move focus to the exit button.
2. When focus mode exits, return focus to the Focus Mode toolbar button.

---

## Screen reader and Foliate iframe

The epub content is rendered inside a sandboxed `<iframe>` managed by foliate-js. Screen readers cannot enter this iframe. This is an architectural constraint and is not fixable at the plugin layer.

**What is achievable:**

- All plugin chrome (toolbar, panel, modals, settings) is fully accessible.
- Navigation controls (TOC links, chapter navigation, search results) are in plugin DOM and can be made accessible.
- The reading progress indicator and page number display are in plugin DOM and carry ARIA live region markup (`aria-live="polite"`) so screen readers announce progress changes.

**What is not achievable:**

- Reading the book text via screen reader.
- Screen reader navigation of epub headings, links, and landmarks inside the iframe.

The plugin README states this under "Accessibility": Orbis Reader is fully accessible for all controls and navigation. The book content itself, rendered inside a web frame by the underlying reader engine, is not accessible to screen readers due to iframe sandboxing.

---

## Gates and limits

- **`pnpm lint:a11y`** fails on an icon-only control with a `title` and no accessible name, so the
  `.title` → `aria-label` rule cannot regress.
- **`pnpm lint:keyboard`** fails on a clickable element with no keyboard path, and on focus captured without being
  restored — build failures rather than review notes.
- Neither sees tab order, ring visibility, contrast or live announcements; those are the manual pass in
  [What a static check cannot see](#what-a-static-check-cannot-see).
- The **Foliate iframe limitation** is stated in the plugin README, because it is the one thing here that cannot be
  fixed from this side.

Orbis has not been run under a screen reader end to end, so the known limitations above cover what a reading of the
code and a keyboard walk find, not what assistive technology would.
