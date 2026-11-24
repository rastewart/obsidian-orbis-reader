# Display Settings

← [User Guide](README.md)

---

## Overview

Display settings change how a book looks: the reader theme, font, size, brightness, spacing and layout.

The display settings are saved in a display style. You can have as many display styles as you like. One display style is always active and each change updates it immediately.

You can change the display settings in two places: the display style bar in the reader, and **Settings → Orbis Reader → Appearance**. A change in one place shows immediately in the other, even when both are open.

---

## The display style bar

The display style bar has four tabs:

| Tab | Controls |
|---|---|
| **Theme** | **Reader theme**, **Brightness** |
| **Layout** | **Mode** (**Paged mode** or **Scrolled mode**), and the **Two-column layout** button. The button shows two columns of lines, and it is highlighted when the layout is enabled. **Page turn**, in **Paged mode** only |
| **Spacing** | **Margins**, **Line spacing**, **Alignment**. Select **More** for **Character spacing**, **Word spacing**, **Paragraph spacing** and **Hyphenation** |
| **Font** | **Font**, **Size**, **Bold text** |

On the **Spacing** tab, **More** opens the tab's second page. **Back**, in the same place, returns to the first. When you choose the **Spacing** tab again, it opens on the first page.

On a phone turned sideways, a tab's controls sit two across, so they fit under the toolbar. If a tab is still taller than the room, the tab stops above Obsidian's own toolbar and you can scroll it.

The left and right arrow keys move between the tabs. The up and down arrow keys move between the tabs, the toolbar above them and the controls below them. See [Using the toolbar from the keyboard](reading-a-book.md#using-the-toolbar-from-the-keyboard).

---

## Change the active display style while you read

1. On the reader's toolbar, select the **Display style** button (palette icon). The display style bar opens under the toolbar.
2. Select a tab: **Theme**, **Layout**, **Spacing** or **Font**.
3. Change a control on the tab.

The change applies to the book immediately. See [The display style bar](#the-display-style-bar).

---

## Change the active display style in Settings

1. Go to **Settings → Orbis Reader → Appearance**.
2. Change a setting.

The **Appearance** page has the same controls as the display style bar, a sample of the text, and the controls for display styles. See [Options and settings](#options-and-settings).

---

## Display styles

A display style is a saved set of all the display settings. When you switch to another display style, all the settings change at the same time.

Use display styles for different places and conditions. For example, make one for a bright room, one for a dark bedroom, and one for a phone.

Each change is saved to the active display style when you make it. There is no **Save** button. For example, if the *Bedtime* display style is active and you change the brightness, *Bedtime* changes immediately.

Focus mode is not a display setting, and a display style does not save it. See [Focus mode](reading-a-book.md#focus-mode).

### The This device display style

Each device has its own display style, named **This device**. To give the device a name, go to **Settings → Orbis Reader → Devices → Device name**. The display style then shows as the device name followed by **(this device)**.

You cannot rename or delete the **This device** display style. Use it for settings that suit one device only, such as a font size for a phone.

### Named display styles

A display style that you create is a named display style.

If you share settings with other devices, do not use a named display style to try a change. The change applies on every device that uses that display style. To try a change, switch to **This device** first, or create a new display style.

### Sharing

Named display styles, the reader theme list and your own reader themes are shared with your other devices. The **This device** display style, and the choice of active display style, apply only to this device. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## Create a display style

1. Go to **Settings → Orbis Reader → Appearance**.
2. In the **Display style** row, select the **New** button (**+**).
3. Type a name, then confirm.

The new display style starts as a copy of the active display style, and it becomes the active display style.

---

## Rename or delete a display style

1. Go to **Settings → Orbis Reader → Appearance**.
2. In the **Display style** dropdown, select the display style.
3. Do one of these:
   - To rename it, select the **Rename** button (pencil icon) and type the new name.
   - To delete it, select the **Delete style** button (trashcan icon), then confirm.

You cannot rename or delete the **This device** display style, so these buttons do not show for it.

---

## Switch to another display style

Do one of these:

- In **Settings → Orbis Reader → Appearance**, select a display style in the **Display style** dropdown.
- Run **Switch display style** from the command palette, then select a display style in the list. You can type to search the list.

For what a display style saves and which display styles are shared, see [Display styles](#display-styles).

---

## Reader theme dropdown options

The **Reader theme** dropdown starts with two options that take their colors from Obsidian. The reader themes that are enabled in the **Reader theme manager** follow them.

| Option | What it does |
|---|---|
| **Match light or dark mode** | Shows black text on white when Obsidian is in light mode, and white text on black in dark mode. It changes when Obsidian changes, including when Obsidian's **Base color scheme** is **Adapt to system** |
| **Match Obsidian's theme** | Uses the background, text and link colors that your Obsidian theme gives a note. If you change your Obsidian theme or its options in **Settings → Appearance → Themes**, the book changes too |

These two options look different. For example, in dark mode on a desktop, Obsidian shows light gray text on charcoal, not white on black. In light mode, Obsidian's text is a very dark gray.

The **Reader theme manager** lists all the other reader themes. Each row shows a line of text in the reader theme's colors, and a switch.

| Reader theme | What it is | Enabled by default |
|---|---|---|
| **Light** | Shows black text on white in all modes | Yes |
| **Sepia** | Shows brown text on a warm off-white | Yes |
| **Dark** | Shows white text on black in all modes | Yes |
| **Paper**, **Gray**, **Charcoal**, **Midnight**, **Emerald**, **Sunset**, **Plum** | Show seven more color sets, from a warm paper to dark blue, green, orange and purple. All are easy to read | No |

An enabled reader theme shows in every **Reader theme** dropdown, in settings and on the display style bar. If you disable a reader theme that a display style uses, that display style keeps it. The display style's dropdown shows it until you select another reader theme.

---

## Enable reader themes and change their order

A reader theme sets the background, text and link colors of a book. Each display style uses one reader theme, or one of two options that follow Obsidian's colors. You select it using the **Reader theme** dropdown. The **Reader theme manager** sets which reader themes the dropdown lists and in what order. You can also [make your own reader themes](#make-your-own-reader-theme) from the **Reader theme manager**.

1. Go to **Settings → Orbis Reader → Appearance → Reader theme manager**.
2. To list a reader theme in the **Reader theme** dropdown, enable its switch. To remove it from the dropdown, disable its switch.
3. Optional: To change the order, move a reader theme up or down, or drag it.

The **Reader theme** dropdowns show the enabled reader themes in this order.

---

## Make your own reader theme

1. Go to **Settings → Orbis Reader → Appearance → Reader theme manager**.
2. Do one of these:
   - To make a new reader theme, select the **New theme** button (**+**) at the top of the list.
   - To start from a reader theme, select its **Make a copy** button.
3. Type a name in **Name**.
4. Select the **Background**, **Text** and **Links** colors.
5. Select **Save**.

A new reader theme is added at the end of the list, and it is enabled. A copy is added after the reader theme that you copied. Its name ends in "copy", for example *Midnight copy*.

The line under the sample shows the contrast between the text and the background, and between the links and the background. If the contrast is below 4.5 : 1, the line shows that the reader theme is hard to read for long.

---

## Change or delete your own reader theme

You can change or delete only the reader themes that you made.

1. Go to **Settings → Orbis Reader → Appearance → Reader theme manager**.
2. Do one of these:
   - To change a reader theme, select it or its **Edit theme** button (pencil icon). Change it, then select **Save**.
   - To delete a reader theme, select its **Delete** button (trashcan icon), then confirm.

The confirmation shows how many display styles use the reader theme. These display styles change to **Match light or dark mode**.

---

## Two columns and the gap between them

When **Two-column layout** is enabled, the page has a gap between the two columns. The gap keeps the end of a line in the left column apart from the start of a line in the right column.

Orbis Reader keeps this gap at a readable width at every **Text margins** value, including 0. For this reason:

- With two columns and **Text margins** at 0, the page still has a small margin at each side. The margin at each side is half the gap between the columns.
- With one column, **Text margins** at 0 gives no margin.

When you increase **Text margins** above this minimum, the gap between the columns increases with the margins.

---

## Fonts

| Font | What it is |
|---|---|
| **Default (use book fonts)** | Uses the fonts that the book sets |
| **Follow Obsidian** | Uses your Obsidian interface font |
| **Georgia** | Serif font, designed for screens |
| **Palatino** | Serif font, lighter and more open |
| **Times New Roman** | Serif font, widely used |
| **Arial** | Sans-serif font |
| **Verdana** | Sans-serif font, wide and easy to read at small sizes |
| **Trebuchet MS** | Sans-serif font, with more character |

A font other than **Default (use book fonts)** applies to all body text, including text that the book sets in its own font. Code, and text that the book sets in a monospace or symbol font, keep the book's font. A different font could change the meaning of this text.

---

## Command palette actions

These commands change the active display style. You can assign a hotkey to each command in Obsidian's **Hotkeys** settings.

| Command | What it does |
|---|---|
| **Increase font size**, **Decrease font size** | Changes the font size by 10% |
| **Increase line spacing**, **Decrease line spacing** | Changes the line spacing by 0.1× |
| **Increase text margins**, **Decrease text margins** | Changes the text margins by 1% |
| **Increase brightness**, **Decrease brightness** | Changes the brightness by 10% |
| **Cycle text alignment** | Changes **Text alignment** to the next of **Follow the book**, **Left** and **Justified**, and shows the new value in a notice |
| **Toggle scrolled mode** | Changes between **Paged mode** and **Scrolled mode** |
| **Toggle column layout** | Changes between one column and two columns |
| **Switch display style** | Opens a list of your display styles that you can search |

---

## Options and settings

These settings are in **Settings → Orbis Reader → Appearance**. They are saved in the active display style.

| Setting | What it does |
|---|---|
| **Display style** | Selects the active display style. The **+**, pencil and trashcan buttons create, rename and delete display styles |
| **Reader theme** | Sets the background, text and link colors. The default is **Match light or dark mode**. See [Reader theme dropdown options](#reader-theme-dropdown-options) |
| **Brightness** | Dims the page, from 20% to 100%. It does not change your screen brightness. The default is 100% |
| **Reading mode** | Sets **Paged mode** or **Scrolled mode**. The default is **Paged mode** |
| **Two-column layout** | Shows two columns in Paged mode when the reading area is wider than it is tall, and wide enough for two columns. Enabled by default |
| **Page turn** | Sets how a page turns in Paged mode: **None** shows the next page at once, and **Slide** moves the page across. The default is **None** |
| **Text margins** | Sets the space at the sides of the text, from 0% to 12%. A higher value gives a narrower column. The default is 3% |
| **Line spacing** | Sets the space between lines of body text, from 1.0× to 3.0×. Headings keep the book's spacing. The default is 1.5× |
| **Text alignment** | Sets the alignment of body text: **Follow the book**, **Left** or **Justified**. The default is **Follow the book** |
| **Character spacing** | Adds space between the letters of body text, from 0% to 25% of the font size. At 0%, the book's own spacing shows. The default is 0% |
| **Word spacing** | Adds space between the words of body text, from 0% to 50% of the font size. At 0%, the book's own spacing shows. The default is 0% |
| **Paragraph spacing** | Sets the space between paragraphs, from 0% to 200% of the font size. At 0%, the book's own spacing shows. The default is 0% |
| **Hyphenation** | Sets whether long words break across lines with a hyphen. The values are **Follow the book**, **On** and **Off**. The default is **Follow the book** |
| **Font** | Sets the font of body text. The default is **Default (use book fonts)**. See [Fonts](#fonts) |
| **Bold text** | Draws all of the book's text heavier. Words that the book makes bold stay bolder. Off by default |
| **Font size** | Scales all the book's text, from 80% to 300%. The default is 100% |

**Two-column layout** usually shows two columns on a computer, or on a tablet or phone turned sideways. In other conditions it can be enabled while the page shows one column. In Scrolled mode, the page always has one column and the setting is hidden. When you go back to Paged mode, the setting is as you left it.

In a CBZ book or a fixed-layout EPUB, where each page is a picture, **Two-column layout** shows two pages side by side when the reading area is wider than it is tall. When it is turned off, you see one page at a time at any size.

**Page turn** set to **Slide** slides the page across when you turn it with a key or the page buttons, or when you let go of a swipe. Moving into the next chapter shows its first page at once. In **Scrolled mode** the setting is hidden, because a scrolled book has no pages. When your device is set to reduce motion, pages turn at once whatever the setting says.

**Left** text alignment gives a ragged right edge. **Justified** aligns the text to both margins. With either value, text that the book centers or right-aligns keeps its alignment, such as title lines, verse and signatures.

**Character spacing**, **Word spacing** and **Paragraph spacing** change body text only. Headings, centered lines and code keep the book's spacing. Character spacing is not added to languages whose letters join, such as Arabic, Persian and Urdu. Some readers find text easier to read with more space: the accessibility guideline WCAG 1.4.12 uses 12% for characters, 16% for words and 200% for paragraphs.

**Hyphenation** set to **On** hyphenates body text. Headings keep the book's hyphenation. **Off** removes all hyphenation, including the hyphens that the book puts in its words.

Obsidian on Windows and Linux does not hyphenate words automatically. On these computers, **On** has no effect, and only a book's own hyphens show. On macOS, iOS and Android, **On** hyphenates words in the book's language. On a device that does not hyphenate words automatically, the display style bar shows **On \***, and the **Hyphenation** setting shows *This device does not hyphenate words automatically.*

The **Reader theme manager** is in **Settings → Orbis Reader → Appearance → Reader theme manager**.

---

## See also

- [Reading a Book](reading-a-book.md): describes the toolbar, the reader and Focus mode
- [Settings Reference](settings-reference.md): lists every setting, including the Appearance page
- [Sync and Devices](sync-and-devices.md#settings-shared-between-devices): describes which settings are shared between devices
- [Format Support](format-support.md): describes what a book's own typography can do
