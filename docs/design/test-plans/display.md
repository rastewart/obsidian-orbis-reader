# Test plan — Display

← [Design Docs](../README.md)

How a book looks: reader theme and the Reader theme manager, brightness, font, size, spacing, alignment and layout, the two places they are changed and how they stay in step, the palette commands that step them, and display styles. What a user sees is in the guide: [Display settings](../../guide/display-settings.md).

**Not here:** paged mode and scrolled mode as ways of moving through a book ([Reading a book](reading-a-book.md)), Focus mode, and a display style reaching another device ([Sync and devices](../../guide/sync-and-devices.md)). Each belongs to its own page.

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

- [ ] `once` In **Settings → Orbis Reader → Appearance**, the **Display style** dropdown shows **This device**, or your device's name followed by **(this device)** if you have named it. Remove any style left from an earlier run: select it, then the trash.

- [ ] `once` Every value on that page is at its default: **Reader theme** Match light or dark mode, **Brightness** 100%, **Reading mode** Paged mode, **Two-column layout** on, **Text margins** 3%, **Line spacing** 1.5×, **Text alignment** Follow the book, **Font** Default (use book fonts), **Font size** 100%.

- [ ] `once` Open **Appearance → Reader theme manager**. The **Themes** list reads **Light**, **Sepia**, **Dark**, **Paper**, **Gray**, **Charcoal**, **Midnight**, **Emerald**, **Sunset**, **Plum**, with only the first three switched on. Delete any theme of your own left from an earlier run with its trash, and put the rest back in that order and state. Obsidian's **Settings → Appearance → Themes** is on Obsidian's own default theme, and **Base color scheme** is **Dark**.

- [ ] `once` Open `annotation-workhorse.epub`. Select **Display style** on the toolbar: the display style bar opens below it with four tabs, **Theme**, **Layout**, **Spacing** and **Font**.

---
## Each control, both ways

The display style bar and **Settings → Appearance** change the same values. For each control, change it in one and watch the book and the other surface follow, then the other way round, with nothing closed or reopened.

- [ ] `desktop` Open **Settings → Orbis Reader → Appearance** over the book with the display style bar still open, so the book and both surfaces are visible. Run the steps below this way.

- [ ] `mobile` Settings covers the book on a phone or tablet. Change each control on the display style bar and check the book, then open Settings and check the control there shows the same value; then change it in Settings, close Settings, and check the book and the bar.

- [ ] `each` **Reader theme** (display style bar: the **Theme** tab, where the dropdown is **Reader theme**). Choose **Light**, **Sepia** and **Dark** in turn: the page and its text change color each time, and Sepia is a warm off-white with brown text. The other surface shows the same choice.

- [ ] `once` With **Reader theme** on **Match light or dark mode**, switch Obsidian between **Light** and **Dark** in **Settings → Appearance → Base color scheme**. The book follows: black text on white, then white text on black.

- [ ] `each` **Brightness** (display style bar: **Theme**). Drag it down to 20%: the page dims, and only the page — the toolbar, the tabs and the rest of Obsidian stay as they were. Drag it back to 100%. The other surface's slider tracks it.

- [ ] `each` **Font** (display style bar: **Font**). Choose **Georgia**, then **Verdana**: the book's text changes font each time. The list has eight choices: **Default (use book fonts)**, **Follow Obsidian**, **Georgia**, **Palatino**, **Times New Roman**, **Arial**, **Verdana** and **Trebuchet MS**. Set it back to **Default (use book fonts)**.

- [ ] `each` Open `stylesheet-checks.epub` and go to its **Embedded fonts** chapter, with **Font** on **Default (use book fonts)**. Both sample lines are in a looping brush script that nothing else on the page uses; a sample line in the same plain serif as the paragraph above it means the book's font did not load. Choose **Georgia**: both lines change to Georgia. Set **Font** back to **Default (use book fonts)**: the script returns. Go back to `annotation-workhorse.epub`.

- [ ] `each` Open `stylesheet-hazards.epub`: its page appears as quickly as any other book's, with five rows, each reading **PASS**. The last two, a stylesheet holding `url(` and a thousand spaces and one holding eight thousand digits, froze the reader for tens of seconds or more before ORBIS patches 25 and 26. Go back to `annotation-workhorse.epub`.

- [ ] `each` **Font size** (display style bar: **Font**). Drag it from 80% to 300%: the text grows across the whole range and the page reflows. Set it back to 100%.

- [ ] `phone` Open `technical-book.epub` and, on the **Contents** tab, select **1. First Steps**, then turn the pages to **Figure 1-1**, a wide figure inside an indented paragraph. Set **Font size** to 300%. The figure stays inside the page at every size along the way, and none of it is drawn on the next page. Set it back to 100%.

- [ ] `each` **Text margins** (display style bar: **Spacing**). Drag it to 12%, then 0%: the column of text narrows and widens. Set it back to 3%.

- [ ] `each` **Line spacing** (display style bar: **Spacing**). Drag it to 3.0×, then 1.0×: the lines spread and close up, and the headings keep their own spacing. Set it back to 1.5×.

- [ ] `each` **Text alignment** (display style bar: **Spacing**, where it is **Alignment**). Choose **Justified**: both edges of each paragraph line up. **Left**: the right edge goes ragged. **Follow the book**: back to the book's own. The chapter title stays centered throughout.

- [ ] `each` **Reading mode** and **Two-column layout** (display style bar: **Layout**). Set **Reading mode** to **Scrolled mode**: the two-column control disappears from both surfaces. Set it back to **Paged mode**: it is back on both, as it was.

- [ ] `desktop` On a wide pane, turn **Two-column layout** off: one column. Turn it on: two. The bar's button is lit exactly when the Settings switch is on.

- [ ] `desktop` With the display style bar open and a tab selected, press Shift+Tab until **Bookmark this location** has the keyboard, then **Enter**. The bookmark is added, the display style bar closes, and the keyboard stays on **Bookmark this location**.

- [ ] `desktop` Select **Display style** with the mouse to open its bar, then press **Escape** without selecting anything else. The bar closes, the button is no longer lit, and the right arrow turns the page.

- [ ] `desktop` Select **Listen** with the mouse to open its bar, and press **Escape** before pressing play: the bar closes and the right arrow turns the page. Open it again, press play, then **Escape**: the bar stays and the audio goes on.

- [ ] `desktop` Open the display style bar, select a tab, and press **Escape**. The bar closes and the keyboard is on the book: the right arrow turns the page.

- [ ] `desktop` In a number field beside a slider — **Line spacing** on either surface — select its contents and type `2.1`. Every character goes in, and the field does not jump to a rounded value while you type. Do the same in the **Brightness**, **Text margins** and **Font size** fields with whole numbers.

- [ ] `desktop` With the display style bar open, focus a tab and press the left and right arrows. They move between the four tabs, opening each, and the page does not turn. Press the down arrow: the keyboard moves to the open tab's first control. Press Tab to reach a button there, then the up arrow: back to the open tab. Up again: the **Display style** button on the main toolbar.

- [ ] `once` The **Preview** at the bottom of **Settings → Appearance** changes as you change the reader theme, brightness, font, font size, line spacing, alignment and margins. With **Follow the book** it shows left-aligned text, since there is no book behind it to follow.

---
## Reader themes and the Reader theme manager

- [ ] `each` The **Reader theme** list, on both surfaces, holds five choices in this order: **Match light or dark mode**, **Match Obsidian's theme**, **Light**, **Sepia** and **Dark**.

- [ ] `desktop` Set **Base color scheme** to **Adapt to system**, with **Reader theme** on **Match light or dark mode**. In macOS **System Settings → Appearance**, switch between **Light** and **Dark**: Obsidian follows, and the book follows Obsidian, without being reopened. Set **Base color scheme** back to **Dark**.

- [ ] `each` Choose **Match Obsidian's theme**. On the Mac in dark mode the page turns charcoal with light gray text, the color of an Obsidian note beside it, rather than black and white; on a phone or the iPad in dark mode it stays black and the text turns light gray. Links are Obsidian's accent color. Switch **Base color scheme** to **Light**: the page turns white, and the text very dark gray on the Mac or black on a phone. Set it back to **Dark**.

- [ ] `desktop` With **Match Obsidian's theme** still chosen, choose an installed community theme whose notes are not black or white in **Settings → Appearance → Themes**. The book takes that theme's note background and text color without being reopened. Choose the default theme again: the book goes back to charcoal.

- [ ] `each` Open **Appearance → Reader theme manager**. At the top: *Enable the reader themes you want in the Reader theme list and put them in order. Select + to make your own.* Under it is one list, **Themes**, with a **+** in its heading. Each row has the theme's name, a line of text in its colors with an underlined link, then a copy button, a switch, up and down arrows and a drag handle. The provided rows have no pencil and no trash, and their buttons still line up with the rest.

- [ ] `each` Switch on **Midnight** and **Emerald**. Back on **Appearance**, the **Reader theme** list ends with **Midnight** and **Emerald**, after **Dark**, and so does the display style bar's. Choose **Midnight**: the page is dark blue with light gray text, and links are light blue. Choose **Emerald**: dark green with very light green text.

- [ ] `each` With **Midnight** chosen, look at the **‹** and **›** page arrows at the left and right edges of the page. They are a faint version of the page's light gray text, easy to find on the dark blue, and on the desktop they brighten when the pointer is over them. Choose **Sepia**: they turn a faint version of its dark brown text.

- [ ] `each` In the Reader theme manager, move **Midnight** to the top of the list with its up arrow. Both **Reader theme** lists now read the two **Match** choices, then **Midnight**, **Light**, **Sepia**, **Dark**, **Emerald**. The display style bar of the open book shows the new order without the book being reopened.

- [ ] `desktop` Drag **Emerald** above **Light** by its handle: both **Reader theme** lists follow.

- [ ] `once` Choose **Midnight**. In the Reader theme manager switch **Midnight** off. The book stays dark blue, and both **Reader theme** lists still show **Midnight** as the choice. Choose **Sepia**: **Midnight** is no longer in either list.

- [ ] `once` Switch off **Light**, **Sepia**, **Dark** and **Emerald**, with **Sepia** chosen. The book stays sepia, and the **Reader theme** list holds the two **Match** choices and **Sepia**. Choose **Match light or dark mode**: the list holds only the two **Match** choices. Switch **Light**, **Sepia** and **Dark** back on.

- [ ] `each` Select **+** in the list's heading. The **New theme** dialog has **Name**, **Background**, **Text** and **Links**, a sample passage, and a contrast line, *Contrast: text … : 1, links … : 1*. It starts from the colors the book is in.

- [ ] `each` Change **Background**, then **Text**, then **Links**: the sample changes with each, and so do the figures. Choose a text color close to the background: the line ends *below 4.5 : 1, hard to read for long*. Choose a readable one again.

- [ ] `once` Select **Save** with **Name** empty: a notice says *Give the theme a name.* Type **Sepia** and select **Save**: *A theme called “Sepia” already exists.* Type **Harbor** and select **Save**.

- [ ] `each` **Harbor** is at the end of the list, switched on, with a pencil, a copy button and a trash, and its contrast line under its name. It is at the end of both **Reader theme** lists. Choose it: the book takes its colors.

- [ ] `once` Select the **Harbor** row: the **Edit theme** dialog opens with its colors. Change **Background** and select **Save**: the open book repaints without being reopened.

- [ ] `each` Select **Midnight**'s copy button. The **New theme** dialog opens with Midnight's colors and the name *Midnight copy*. Select **Cancel**: nothing is added. Select it again and select **Save**: **Midnight copy** appears just after **Midnight**, switched on, with a pencil and a trash. Copy **Midnight** once more and save: it is named *Midnight copy 2*. Delete both copies.

- [ ] `ipad` In portrait, the Reader theme manager's rows are laid out as on a phone: the name and its sample across the full width, the buttons and switch beneath them. Turn the iPad to landscape: if the list is wide enough, the buttons move back beside the sample, and the sample is never squeezed to a word per line.

- [ ] `phone` The Reader theme manager's rows fit the screen: each row's sample wraps rather than running off the edge, and the buttons and switches line up. In the **New theme** dialog, each color opens the phone's color picker, and **Save** and **Cancel** stay above the keyboard while typing a name.

- [ ] `once` With **Harbor** chosen, select its trash. *Delete theme?* says *“Harbor” will be deleted. 1 display style uses it, and will match Obsidian's light or dark mode instead.* Select **Delete**: the book turns black and white, and both **Reader theme** lists show **Match light or dark mode**.

- [ ] `once` Put the list back: **Light**, **Sepia**, **Dark**, **Paper**, **Gray**, **Charcoal**, **Midnight**, **Emerald**, **Sunset**, **Plum**, with only the first three switched on.

---
## Text on a book's own background

`fixtures/contrast-checks.epub` (`pnpm build:contrast-epub`): ten rows of the book's own backgrounds and text colors, each saying what it should look like. `fixtures/contrast-fixed-layout.epub`, from the same command: one fixed-layout page. See `docs/design/reader-themes.md`, "Text on a book's own background".

- [ ] `each` Open the debug log and turn on the **display** pill. Open `contrast-checks.epub` with the **Dark** theme. Rows 1 to 8: every sentence is readable. In row 1's pale box the sentence is dark; in row 3 the gray line is the theme's text color; row 6's yellow box is dark text on yellow, as the book drew it. Row 9's gradient box may be hard to read, as it says. Row 10's white words stay white over the dark picture. The log shows *contrast: N of M elements given a readable color, in X ms*, with N above 0.

- [ ] `each` Switch to **Light**, then **Sepia**, without closing the book. Rows 1 to 10 are readable in both. Row 2's dark box has light text; row 1's pale box keeps the theme's text color; row 7's caption stays the book's soft gray; row 10's words stay white over the dark picture, not dark. The log shows a new *contrast:* line for each switch.

- [ ] `each` Switch back to **Dark**: the page looks as it did in the first step, with nothing left over from the light themes.

- [ ] `each` Open `contrast-fixed-layout.epub` in **Light**, then switch to **Dark**. In both, the page's words are white over the dark picture, and the log says *contrast: a fixed-layout page, left as the book drew it*.

- [ ] `once` Open the largest book you have at its longest chapter, with the **display** pill on. Write down the *in X ms* the *contrast:* line shows, on each device.

---
## A book's own typography

- [ ] `once` Open `body-text-styles.epub`. In **Justified by the book**, the paragraphs are justified by the book. Set **Text alignment** to **Left**: they go ragged-right. In **Centered and right-aligned lines**, the centered titles, the verse and the right-aligned signature do not move. Set it back to **Follow the book**.

- [ ] `once` In the same book, set **Font** to **Arial** and **Line spacing** to 2.5×. In **A font in spans** and **One wrapper, many paragraphs**, every paragraph follows. In **Code and symbols keep their font**, the inline code, the monospace and symbol spans and the code block keep the book's own font. Set both back.

- [ ] `once` Open `keyword-sizes.epub` at **Font size** 100% and note the size of the text in each chapter, then set it to 150%. The text grows in **Paragraphs set small**, **Inline sizes** and **Shorthand and important**, and the text in **Relative sizes are left alone** grows too, as it always did. Set it back to 100%.

- [ ] `once` Open `annotation-workhorse.mobi` and `annotation-workhorse.epub` side by side at **Font size** 150%. In both, the chapter heading **MENDING THE NETS** is larger than the text under it.

---
## Two columns and the gap between them

- [ ] `desktop` In `annotation-workhorse.epub`, on a pane wide enough for two columns, set **Text margins** to 0%. A gap stays between the two columns, and a small margin stays at each side of the page. Set **Two-column layout** off: with one column, 0% leaves no margin at the sides. Set both back.

- [ ] `phone` Turn the phone to landscape so two columns show, and set **Text margins** to 0%: the same gap between the columns. Set it back and turn the phone upright.

---
## From the command palette

Each command changes the selected display style; with the display style bar open, its controls follow.

- [ ] `once` **Increase font size** five times: the size goes up 10% each time. **Decrease font size** until it stops: it stops at 80%. Set it back to 100%.

- [ ] `once` **Increase line spacing** until it stops: 0.1× a step, stopping at 3.0× with no stray decimals such as 2.9000001. **Decrease line spacing** until it stops: 1.0×. Set it back to 1.5×.

- [ ] `once` **Decrease brightness** until it stops: 10% a step, stopping at 20%. **Increase brightness** back to 100%.

- [ ] `once` **Increase text margins** until it stops: 1% a step, stopping at 12%. **Decrease text margins** until it stops: 0%. Set it back to 3%.

- [ ] `once` With **Text alignment** on **Follow the book**, run **Cycle text alignment**: it becomes **Left**, and a notice says **Text alignment: Left**. Run it again: **Justified**. Again: **Follow the book**. Each time the book and the **Alignment** dropdown follow.

- [ ] `once` **Toggle column layout** turns two columns off and on; **Toggle scrolled mode** switches to **Scrolled mode** and back.

---
## Display styles

- [ ] `once` On **This device**, the **Display style** row has a **+** button and no pencil or trash, and its description says the style cannot be renamed, deleted or shared with other devices.

- [ ] `once` Select **+** and name the new style **Bedtime**. It is selected, and every value is the same as the style you came from. The row now has a pencil and a trash as well.

- [ ] `each` With **Bedtime** selected, set **Reader theme** to **Dark** and **Brightness** to 60% from the display style bar. Switch back to **This device** in **Settings → Appearance**: the book returns to the values it had. Switch to **Bedtime**: dark and dimmed again, with nothing saved by hand.

- [ ] `once` Run **Switch display style** from the command palette. A searchable list shows both styles. Pick **This device**: the book changes at once.

- [ ] `once` Select **Bedtime**, then the pencil, and rename it **Night**. The dropdown shows **Night**.

- [ ] `once` With **Night** selected, select the trash. It asks **Delete display style?** with **“Night” will be removed.** Select **Delete**: the style goes, and **This device** is selected again.

- [ ] `each` With **Settings → Appearance** and the book's display style bar both open, change the theme, font, font size, line spacing, alignment, mode, two columns and margins on one, then the other. Each time, the other surface's control moves to match, and the book changes once: with the debug log's **display** pill on, a theme change shows one `reinjectAllDocs` and one `applyHostBg`, and a mode, columns or margins change one `applyRenderer` and no `reinjectAllDocs`.

- [ ] `each` In an ordinary book, with the **display** pill on, drag the font-size slider steadily from one end to the other: the thumb follows the hand without jumping back, the book follows a few times a second, and it ends on the size where the thumb was let go. The log shows a few `reinjectAllDocs` for the whole drag, each with a different size.

- [ ] `each` Open the largest book you have at its longest chapter and drag the font-size slider the same way, twice. The thumb moves freely under the hand; after the first drag the book changes once, when the slider is let go, and the log shows one `reinjectAllDocs` per drag. Do the same with line spacing and margins. Brightness still follows the drag.

- [ ] `each` In the same book, switch between two display styles that differ in theme, font size and margins. The book changes once: the log shows one `reinjectAllDocs`, one `applyRenderer` and one `applyHostBg` for the switch, and **Settings → Appearance** shows every value of the new style.

---
## Tooltip distance

- [ ] `desktop` In **Settings → Orbis Reader → Appearance**, **Tooltip distance** sits below **Toolbar**, outside the display style, with a slider and a **Sample** button. Hover **Sample**: the tooltip **This is how far tooltips sit from the control.** sits at Obsidian's usual distance below it.

- [ ] `desktop` Drag the slider most of the way up and hover **Sample** again: the tooltip is farther below. Hover a button on the reader's toolbar: its tooltip is as far. Hover the ribbon on Obsidian's left: its tooltips are where they always are.

- [ ] `desktop` Hover the toolbar's **←** and the marks bar's buttons: each shows one tooltip, never two. Set the slider back to its lowest.

- [ ] `desktop` Hover a grayed-out control with a tooltip — the ↑ on the first row of any reorderable list, or a recording's trash while a recording runs: its tooltip sits above the control, clear of the "not allowed" pointer. Near the top of a window, it sits to the left instead. Hover an enabled control: its tooltip is below, as before.

- [ ] `mobile` **Tooltip distance** is not on the Appearance page.

---
## Obsidian's own font size

- [ ] `mobile` Raise Obsidian's own font size in **Settings → Appearance → Font size**, not Orbis Reader's. The reader's toolbar, its bars, its dialogs and the Navigator grow with the rest of Obsidian, and the book's text does not. At the largest size things look crowded, but nothing is cut off or unreadable. Set it back.

---
## Clean up

- [ ] `once` In **Settings → Orbis Reader → Appearance**, **This device** is selected and every value is back at its default, as listed under Setup. The Reader theme manager's list is back in the order and state listed under Setup, with no theme of your own.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
