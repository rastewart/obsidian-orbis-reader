# Display Styles System

← [Design Docs](README.md)

## Overview

A display style is a named snapshot of all display settings. Every device automatically gets a device-specific style on first load. Users can create additional named styles (shared across devices) for different reading contexts — a sepia night style, a focused single-column style, etc.

This document covers the `DisplayStyle` data model and its sync/lifecycle. The toolbar UI for editing the *currently active* style's settings live (the Display Style menu — Theme/Layout/Spacing/Font tabs) is documented in [Toolbar & Content Panel § Display Style menu](toolbar-and-panels.md#display-style-menu).

---

## Data model

```typescript
interface DisplayStyle {
  id:        string;     // generateStyleId() — timestamp-based random ID
  name:      string;     // user-visible label (e.g. 'Comfortable Fiction')
  deviceId?: string;     // set only for auto-created per-device styles
  settings: {
    theme:       string;      // a reader theme's id — see reader-themes.md
    fontFamily:  string;
    fontSize:    number;      // percentage, 80–300
    lineHeight:  number;      // 1.0–3.0
    textAlign:   'book' | 'left' | 'justify';
    hyphenation?: 'book' | 'on' | 'off';     // absent in older styles: the book's
    letterSpacing?: number;   // % of the font size, 0–25; 0 or absent is the book's — see text-spacing.ts
    wordSpacing?: number;     // % of the font size, 0–50
    paragraphSpacing?: number; // % of the font size, 0–200
    boldText?:   'on' | 'off';            // absent in older styles: off — see bold-text.ts
    pageTurn?:   'none' | 'slide';        // absent in older styles: none — see page-turn.ts
    margins:     number;      // renderer gap %, 0–12
    brightness:  number;      // percentage, 20–100
    flow:        'paginated' | 'scrolled';
    columns:     1 | 2;
  };
  createdAt: number;     // Date.now()
}
```

Styles are stored in `OrbisPluginSettings.styles[]` in `data.json` and travel between devices via Obsidian Sync.

---

## localStorage keys

Display settings are **applied** via `localStorage` so that every open reader view can respond to changes instantly. Propagation is via the internal `app.workspace.trigger('orbis:settings-change', key, value)` event bus, **not** the DOM `StorageEvent` — see [Change propagation](#change-propagation) below. Styles in `data.json` are the source of truth; localStorage is a live read-through cache of the active style.

| Key | Type | Purpose |
|---|---|---|
| `orbis-active-style-id` | string | Which style is currently active on this device |
| `orbis-theme` | string | A reader theme's id — see [Reader themes](reader-themes.md) |
| `orbis-font-family` | string | CSS font-family string or `'default'` \| `'obsidian'` |
| `orbis-font-size` | string | integer percentage |
| `orbis-line-height` | string | float |
| `orbis-text-align` | string | `'book'` \| `'left'` \| `'justify'` (an `orbis-justify` value is carried across at load) |
| `orbis-hyphenation` | string | `'book'` \| `'on'` \| `'off'` |
| `orbis-letter-spacing` | string | integer percentage of the font size, `0` the book's |
| `orbis-word-spacing` | string | integer percentage of the font size, `0` the book's |
| `orbis-paragraph-spacing` | string | integer percentage of the font size, `0` the book's |
| `orbis-bold-text` | string | `'on'` \| `'off'` |
| `orbis-page-turn` | string | `'none'` \| `'slide'` |
| `orbis-margins` | string | integer |
| `orbis-brightness` | string | integer percentage |
| `orbis-flow` | string | `'paginated'` \| `'scrolled'` |
| `orbis-columns` | string | `'1'` \| `'2'` |

---

## Device-default styles

`OrbisReaderPlugin.initDeviceStyle()` runs on every `onload`:

1. Looks for a style in `settings.styles` whose `deviceId` matches the current device.
2. If none found: creates a `DisplayStyle` with `deviceId` set, capturing the current `localStorage` values via `readCurrentDisplaySettings()`. Saves it. Sets it as active in `localStorage` if no active style is set.
3. If found and no active style is set in `localStorage`: sets this style as active.

Device styles are filtered in `SwitchStyleModal` — other devices' device-default styles are not shown. The device name comes from `localStorage('orbis-device-name')` (set in settings).

---

## Style lifecycle

### Applying a style

`OrbisReaderPlugin.switchToStyle(styleId)`:
1. Finds the `DisplayStyle` by ID.
2. Sets `localStorage('orbis-active-style-id')` to `styleId`.
3. Calls `applyStyleToLocalStorage(app, style.settings)`, which writes every setting via `app.saveLocalStorage(key, value)` and then fires **one** `orbis:settings-change` event, with the key `DISPLAY_STYLE_APPLIED`. Every open `OrbisReaderView` reads all its display settings again and lays out, restyles and repaints once each; Settings reads all its display controls once (`syncAllStyleControls`). One event per value would apply each on its own — five restyles and three layouts for one switch, which a book with a very large chapter feels as seconds. (`applyStyleToLocalStorage` and `readCurrentDisplaySettings` both take `app` as their first argument.)

### Saving the active style

`OrbisReaderPlugin.updateActiveStyle()` reads the current `localStorage` values and writes them back to the `DisplayStyle.settings` in `OrbisPluginSettings`. Called from the settings UI whenever a display knob is adjusted.

### Creating a new style (shared)

The settings UI allows creating a named style from current settings:
1. `readCurrentDisplaySettings()` snapshots `localStorage`.
2. A new `DisplayStyle` with no `deviceId` is created and added to `settings.styles`.
3. Saved to `data.json`; Obsidian Sync distributes it to other devices.

### Renaming / deleting styles

Handled in `OrbisSettings`. Device-default styles cannot be deleted (they are re-created on next `onload` anyway).

---

## Body text, and why the settings land on it

Alignment, line spacing and font are applied to **body text**, not to `body`. A rule on `body`
loses to any rule the book writes for the paragraph itself — a declaration on an element beats
an inherited one, `!important` or not — and the book's own stylesheets load. Most books justify
their body text themselves, on the paragraph or via `body`, and many center or right-align some
paragraphs (title lines, verse, signatures). Some set line-height or a font on their paragraphs,
and Word and InDesign exports wrap most words in spans that set a font. Sizes in `px` or `pt`
are rare in body text and headings, and are not rewritten.

`tagBodyText` (`reader/body-text.ts`) runs when each chapter loads, before the display styles
go in, and reads the book's computed alignment: a leaf block — text, no block inside it — that
the book aligns left, justified or not at all gets `.orbis-body-text`; centered and
right-aligned ones do not, so they keep the book's layout. Inside tagged blocks, code and
anything in a monospace or symbol font gets `.orbis-keep-font`. `buildBookCss` then styles the
tags: line-height on body text, the chosen font on body text and every descendant except code
and `.orbis-keep-font`, and alignment on body text when it is not the book's.

**Alignment has three answers** (`TextAlign`, `text-align.ts`): follow the book (the default,
the font's "use book fonts" shape), left, justified. `migrateTextAlign` carries the older
yes/no value to these — its "no" added no rule, so it becomes "the book's" — in every named
style, the device's own style and the live value, in place and idempotently. Justified applies
to tagged body text only, never to every `p`: a one-line justified paragraph renders
left-aligned, so a centered title would lose its centering.

**Font size scales everything together.** Sizes in `em`, `rem` and `%` follow the `html`
percentage the setting writes; the absolute keywords (`small`, `x-large` …) do not, being fixed
steps from the browser's `medium`. Some publishers set every paragraph `small`, and the setting
would do nothing to that body text. `scaleKeywordSizes` (`reader/keyword-sizes.ts`) runs at
chapter load and rewrites each keyword in the book's parsed stylesheets and inline styles to
`rem`, keeping `!important`; `smaller`/`larger` already scale and are left alone. The factors
are the size table browsers actually render (9, 10, 13, 16, 18, 24, 32, 48px at a 16px
`medium`), not the CSS spec's ratios: the spec's 8/9 makes a `small` paragraph 14.2px instead
of 13px, larger at 100% than the browser renders it.

The `<font size>` tag is sized the same way. An older MOBI has no stylesheet, so its headings
arrive as `<font size="5">`, which the browser sizes as `x-large`; at a large font size the
heading would be smaller than its text. Each tag (1 to 7, or `+n`/`-n` from 3) gets its
keyword's `rem` from a sheet placed before the book's own, inside `:where()`, so any rule of
the book's still wins over it, as it does over the tag.

## Change propagation

When a display setting changes (e.g. user moves a font-size slider, in either
the plugin Settings tab or the Display Style toolbar menu), the control that
changed:
1. Writes the new value to `localStorage` via `App#saveLocalStorage`.
2. Dispatches `app.workspace.trigger('orbis:settings-change', key, value)` — a
   plugin-defined custom workspace event (not the browser's native
   `StorageEvent`: `App#saveLocalStorage` is vault-scoped and doesn't fire
   native storage events).

Every open `OrbisReaderView` registers a listener for this event
(`OrbisReaderView.ts`, near `onOpen`) that updates `this.settings` and calls
`reinjectAllDocs()` / `applyRenderer()` / `applyHostBg()` as appropriate, so
all open reader views reflect the change immediately without any direct
inter-view communication.

**That listener is the only place a change is applied**, including in the
view whose display style bar made it: `saveSetting` announces the change and
the view hears its own announcement. A control that also applied its change
itself did every restyle twice.

**A slider applies at a pace the book can keep up with** (`paced`, in
`slider-input.ts`, used by `bindRealTimeSliderInput`). Its number field follows
the thumb at once, but the value is applied at once for the first step, then
at most every `SLIDER_APPLY_EVERY_MS` (250 ms, counted from when the last one
finished applying), always ending on the latest value, and at once on letting
go or leaving the field. **Once an apply has taken longer than
`SLOW_APPLY_MS` (50 ms), the slider waits to be let go**: a very large chapter
restyles in a hundred milliseconds or more and then lays out again, so even a
paced drag stalled the thumb. An ordinary chapter restyles in a millisecond or
two and follows the drag.

Two UI surfaces also listen for this event purely to keep their own controls
visually in sync, independent of the book re-render above:

- **Display Style toolbar menu**: `view.syncDisplayMenu()` (`display-menu.ts`)
  re-reads every control from `view.settings` and updates the DOM. It runs
  both when the menu is opened and on every incoming `orbis:settings-change`
  event, so it stays current even while left open.
- **Plugin Settings tab**: `OrbisSettings.syncReadingTabControl` — a listener
  registered once in the `OrbisSettings` constructor (not per-`display()`
  call, to avoid leaking a new listener on every tab re-render) that updates
  the single control matching the changed key via `setValue()` / direct
  `.value` assignment. It deliberately does **not** call `this.display()` or
  re-dispatch the event — either would interrupt an in-progress slider drag
  and risks feedback loops.

Both listeners are safe to receive events they themselves triggered, but not
because `setValue()` is silent: Obsidian's `SliderComponent` and
`ToggleComponent` call their `onChange` from `setValue()` whenever the value
moves (its `DropdownComponent` does not). So the Settings slider's `onChange`
only rewrites its number field, and the two-column toggle's announces only a
value the stored one does not already hold; otherwise every change made in the
display bar was announced a second time by Settings mirroring it.

**A slider being dragged is never written by a sync** (`isSliderDragging`, in
`slider-input.ts`): the display bar and Settings both skip it. Written mid-drag,
the thumb jumped back under the hand, and the drag's next step read the
written value and applied it again.

That's the whole story for the slider/dropdown/toggle components themselves,
but each slider's *paired number input* (a raw `<input type="number">`, not
an Obsidian component — see `bindRealTimeSliderInput()` in `slider-input.ts`)
needs one more guard: `bindRealTimeSliderInput` dispatches on every
`'input'` keystroke, not just on commit, so both listeners above fire
*while the user is still typing* into that exact field. Unconditionally
overwriting `el.value` in that state stomps on whatever's partway typed and
jumps the cursor — typing "2.1" into line spacing reads one digit at a
time ("2" → dispatches `2.0` → the listener immediately rewrites the field
to "2.0"/"2" mid-keystroke), making it impossible to type a second
character. Both `syncDisplayMenu()` and `syncReadingTabControl` guard each
paired number input with `el.ownerDocument.activeElement !== el` before
writing to `.value` — the input currently focused is left alone (its
slider still updates live) until it loses focus, at which point
`bindRealTimeSliderInput`'s own `blur` handler reconciles it.

---

## Commands

`orbis-switch-display-style` opens `SwitchStyleModal` — a `FuzzySuggestModal` listing all styles visible to this device (shared styles + this device's own device-default). Selecting a style calls `switchToStyle`.

---

## What is NOT in a style

Settings stored in `OrbisPluginSettings` but NOT in `DisplayStyle.settings` (they sync but aren't per-style):
- Toolbar button visibility flags
- `progressMode` / `progressModes`
- Book export settings
- Note styles

Settings that are device-only (localStorage only, not synced at all):
- Device ID / device name
- Active style ID (`orbis-active-style-id`)
- Debug settings
