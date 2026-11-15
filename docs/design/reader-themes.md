# Reader themes

← [Design Docs](README.md)

A reader theme is the background, text and link colors a book is painted with. It is one of a display style's nine
values (`theme`, stored as an id), chosen from the Theme dropdown on **Settings → Appearance**, on **Setup**, and in
the book's display menu. `src/reader-themes.ts` is the only code that knows which themes exist and what each paints.

---

## The themes

**Two are always offered, first in every Theme list**, and are not in the Theme manager:

| Id | Label | Paints |
|---|---|---|
| `auto` | Match light or dark mode | Light's colors when Obsidian is light, Dark's when it is dark |
| `obsidian` | Match Obsidian's theme | The note colors of the Obsidian theme in use |

`auto` keeps the id it had when it was the only Auto, so a vault already using it reads exactly as before. It is also
what a deleted theme falls back to, which is one reason neither can be switched off: the fallback has to exist, and
with the two always there a Theme list can never be empty.

**Everything else is one ordered list, `readerThemes`**, in the Theme manager — the shape of the look-up popup's web
destinations:

| Id | Label | Paints | On in a new vault |
|---|---|---|---|
| `light` | Light | `#ffffff` / `#000000`, links left to the book | yes |
| `sepia` | Sepia | `#f4ecd8` / `#5b4636`, links `#8a4b20` | yes |
| `dark` | Dark | `#000000` / `#ffffff`, links `#7bb3f0`, visited `#a78bda` | yes |
| `paper` … `plum` | Paper, Gray, Charcoal, Midnight, Emerald, Sunset, Plum | See `PRESET_THEMES` | no |
| `theme-…` | The reader's own | A name, a background, a text color and a link color | on when made |

The seven extras each clear 7 : 1 for text and 5 : 1 for links against their background, the fun ones included, and
Light, Sepia and Dark clear the Theme manager's 4.5 : 1; the test holds them to it.

**Light names no link color**, so a book's links keep the book's own color — for most books the browser's blue,
`#0000ee` (`BOOK_LINK`). Its sample shows that blue, and a copy of Light starts with it.

**A provided theme's entry is only its place and its switch** (`{ id, offered, builtin: true }`); its colors are in
code, so a provided theme can be moved and switched off but never edited or deleted. **A made theme's entry is the
whole theme.**

**`settleThemeList` keeps the list within its rules on the way in**, since it arrives from `data.json` and from other
devices, either of which can be older or hand-edited: every provided theme exactly once, a provided theme this version
adds appended with its default switch, a repeat or an entry without its colors dropped. It runs at load, before the
Theme manager draws, and inside `themeChoices`.

---

## Offered, switched off, deleted

**A dropdown lists the two, then the switched-on themes in the list's order** (`themeChoices`). Nothing else, so the
list holds what the reader asked for, in the order they put it.

**Switching a theme off takes it out of the lists, and nothing more** — Light, Sepia and Dark included. A display
style already using it keeps it and paints with it. Its dropdown lists it while it is the value, so the dropdown shows
what is in use rather than a blank; choose another theme and it is gone from that list. Switching off never reaches
into a style and changes how a book looks — on this device or on another one that has the same style. **Nothing
locks**: switching every listed theme off leaves the two that match Obsidian.

**Every row can be copied.** A copy opens the theme dialog filled with the original's colors and the name "Midnight
copy" (or "… copy 2" when that is taken); Save puts it just after the original, switched on, and Cancel makes nothing.
That is how a provided theme becomes one of the reader's own to adjust.

**Deleting one of the reader's own is the only way a theme stops resolving.** Nothing is rewritten: `resolveThemeId`
turns an id that names nothing into `auto`, so every style, on every device, that used it now matches Obsidian's light
or dark mode. The delete confirmation counts the display styles this device can see using it. Another device's own
style is beyond that count and falls back the same way.

---

## Match Obsidian's theme

Obsidian themes all paint a note through the same variables, so the theme's colors are read from them:

| Color | Variable |
|---|---|
| Background | `--background-primary` |
| Text | `--text-normal` |
| Links | `--link-color`, else `--text-accent` |

**Read from inside the reader's own leaf** (`contentEl`), in the reader's own window: a theme that scopes its colors
to a pane is honored, and a popout window reads its own body.

**Converted by painting one pixel** (`cssColorToHex`). A theme may write a color in any form the browser understands —
`rgb()`, `hsl()`, `oklch()`, `color-mix()` — and a canvas reads every one back as sRGB bytes. Brightness scales the
result and the Theme manager measures contrast on it, so both need `#rrggbb`. **A color that is not fully opaque has
no one color to paint a page with**, so a see-through background falls back to the mode's colors.

**What the default theme gives, measured from Obsidian 1.14.4's `app.css`** — which is why matching the theme is not
the same as matching the mode, even with no theme installed:

| Default theme | Background | Text |
|---|---|---|
| Light, desktop | `#ffffff` | `#222222` |
| Light, mobile | `#ffffff` | `#000000` |
| Dark, desktop | `#1C1C1C` | `#dadada` |
| Dark, mobile | `#000000` | `#dadada` |

---

## Following changes

**Two signals, one comparison.** `observeTheme` watches the reader window's body for Obsidian's light/dark flip, and
the workspace's `css-change` event covers the rest: another theme, a theme's own options, a snippet. Both call
`refreshTheme`, which resolves the colors and **repaints only when they differ from the ones last painted**. A
repaint re-injects every section, which the audio player has to pause for (see `theme-watch.ts`), so a `css-change`
that leaves a fixed theme's book alone costs nothing.

**Adapt to system needs nothing of its own.** With Obsidian's base color scheme set to it, Obsidian listens for the
operating system's change and flips its body class itself (measured in 1.14.4's `app.js`), which is the flip
`observeTheme` sees.

**A theme edited, deleted, moved or arriving from another device** reaches an open book through `refreshViews` →
`applyPluginSettings`, which runs the same comparison and refills the display menu's dropdown.

---

## Where the colors are used

Every surface takes its colors from `themeColors`, never from a table of its own:

- the book's own stylesheet (`buildBookCss`), and the host behind it (`applyHostBg`);
- `readerColors()`, which the image viewer, the link preview and, in focus mode, the marking bar and note boxes read;
- the Appearance page's sample, and the Marks dialog's reading sample.

Pocket mode's blackout stays a fixed `#000` / `#fff`: it is about the screen, not the theme.

## Text on a book's own background

**A theme colors the page and the text on `body`, and the chapter inherits it.** A book's shaded box, table cell or
callout keeps the background the book gave it — that is the book's content — and usually sets no text color, trusting
the default black. In a dark theme such a box inherits the theme's light text, light on light; in a light theme a dark
box inherits dark text. A book's own text color fails the other way: its gray on a dark theme's page. A stylesheet
cannot ask what color is behind an element, so `repairContrast` (`src/reader/contrast-repair.ts`) reads the chapter as
drawn, after the theme's styles are in it, and repairs only the text that fails.

- **What fails** is text whose contrast with what is behind it is below 3 : 1 — WCAG's floor for large text, the line
  under which text is hard to read at all. Body text should reach 4.5 : 1, but holding a book to that would recolor
  captions and notes it set in a softer gray on purpose.
- **What is behind it** is the theme's page with every background above the text drawn over it, see-through ones
  included. A background with a picture or gradient in it cannot be measured, so text over one is left as the book
  drew it. SVG is left alone too: its text is drawn with `fill`, not `color`.
- **Never over a picture.** A picture laid under text as an image is not a background, so white lettering over a dark
  illustration would measure as white on the page, and a light theme would turn it dark, over the dark picture. So
  **a fixed-layout book's pages are left whole** — they are designed as pictures with exact colors, and the theme's
  part is the page around them (`inFixedLayout`: the page's frame is in foliate's `foliate-fxl`) — and in a reflowable
  book, **text the book positions** (`absolute` or `fixed`), which is how it lays words over another element, is left
  as drawn.
- **The repair** is the theme's own text color if it reads there, else the theme's page color — dark text in a pale box,
  in a dark theme — else black or white, whichever reads better. It is an inline `!important`, so it wins over the
  book's rules and the theme's link color alike.
- **A theme change undoes every repair and reads the chapter again**, so a color chosen for one theme never decides
  the next. Each repaired element records the inline color it had before, and gets it back.

The debug log's `display` pill says, for each chapter as it loads and on each theme change, how many elements were read,
how many repaired, and how long it took, or that a fixed-layout page was left alone. `fixtures/contrast-checks.epub`
(`pnpm build:contrast-epub`) holds a row for each case, and `fixtures/contrast-fixed-layout.epub` a fixed-layout page of
white lettering over a dark illustration.

---

## Sync

**The whole list travels as one key, `readerThemes`, in the shared settings** — order, switches and the reader's own
themes together, as the web destinations do. A theme is vocabulary: one made on the Mac is one the iPad can choose,
and a display style that travels names one, so the list it is chosen from should be the same list everywhere. The
cost is the shared settings' own: two devices changing the list between syncs, the later change wins all of it. See
[Multi-device sync](multi-device-sync.md#what-participates).
