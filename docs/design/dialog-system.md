# Dialog System

← [Design Docs](README.md)

## Why this exists

Orbis needs dialogs that Obsidian's own `Modal` doesn't handle well on mobile: Obsidian's mobile WebView **does not resize when the on-screen keyboard opens** — `visualViewport` and `window.innerHeight` both keep reporting the full screen height, with the keyboard simply overlapping whatever's at the bottom. Dialogs that each work around this on their own (custom `position: fixed` popups with hand-rolled backdrop, title, close button, and keyboard-safe positioning) drift apart, because nothing makes them stay consistent.

`createOrbisPopup()` in `src/ui-utils.ts` is the fix: one shared implementation that every Orbis custom popup builds on, so the chrome (title, close button, background, corner radius) and the mobile keyboard-safety behavior can't drift apart dialog-by-dialog.

Not every dialog uses it — see [Dialogs that stay as a real Modal](#dialogs-that-stay-as-a-real-modal) below for the case where it's actively the wrong tool.

### Why the real `Modal`s diverge from Obsidian's chrome too

The dialogs that *must* be real `Modal`s (see below) got their own base class, `OrbisModal`, which hides Obsidian's modal header and renders Orbis's own heading and close ×. **No dialog extends Obsidian's `Modal` directly**, and `dialog-contract.test.ts` enforces it: a dialog built on `Modal` directly opens centered in the window while every other dialog opens pinned near the top. Obsidian's `FuzzySuggestModal` is not a dialog in this sense. It is Obsidian's picker, drawn where the command palette is, and *Switch display style* is one on purpose. That looks like a cosmetic choice and isn't: **it is a screen-real-estate decision, and mobile is where it pays.**

Obsidian's mobile modal chrome costs a `modal-header` bar, a raised round close chip, and phone-sized padding before the first row of content. On a phone that puts the heading about twice as far below the dialog's top edge as Orbis's chrome does — most of a mark row in the annotation manager, on every Orbis dialog, on every open.

That matters here more than it would in most plugins because these dialogs are unusually dense. The annotation manager is a list of marks, each carrying a name, badge, live sample, treatment preview, a Shown toggle and three buttons. The glossary is a table with per-row Edit/Delete. The recordings manager is master-detail. For content like this, chrome is not neutral decoration — it is rows the reader has to scroll for.

Consistency between the two dialog families is a real second benefit, but it is the *secondary* one. If a future Obsidian breaks the class list this depends on, **the thing worth preserving is the vertical space, not the flush-left heading.**

---

## `createOrbisPopup()` API

```ts
function createOrbisPopup(host: OrbisPopupHost, opts: {...}): OrbisPopupHandle
```

### `OrbisPopupHost`

A narrow structural interface (not `OrbisReaderView` directly, to avoid a circular import) that any popup-hosting object must satisfy:

```ts
interface OrbisPopupHost {
  contentEl: HTMLElement;
  lockMobileHeights(): void;
  unlockMobileHeights(): void;
}
```

`OrbisReaderView` satisfies this natively (it already has `contentEl` and the two lock methods). `OrbisSettings` does **not** implement it — see below.

### `OrbisPopupHandle` (return value)

| Field | Type | Purpose |
|---|---|---|
| `popupEl` | `HTMLElement` | Append dialog-specific content here, after the title/close button `createOrbisPopup` already added. |
| `titleEl` | `HTMLElement` | The heading's **text span**, for a dialog that retitles itself as it navigates (Recordings' master-detail). Writing to the heading row instead would take the icon with it. |
| `close` | `() => void` | Closes the popup: removes DOM, backdrop, listeners; unlocks mobile heights (delayed); pops itself off the popup stack; calls `opts.onClose`. |
| `reposition` | `() => void` | Re-runs the mobile position/size calculation. No-op on desktop. See [Dynamic content](#dynamic-content-reposition). |

### Options

| Option | Default | Purpose |
|---|---|---|
| `title` | *(required)* | Rendered via the shared `.orbis-dialog-title` class. |
| `icon` | — | Inline SVG string, shown before the title. See [Title icons](#title-icons) for when a dialog gets one. |
| `dismissOnOutsideClick` | `true` | Set `false` for dialogs with in-progress state that shouldn't be lost to an accidental tap (note editor, forms, confirmations). |
| `desktopWidth` | `'320px'` | Any CSS width value, including `min(620px, 90vw)` style expressions. |
| `mobileMaxWidth` | `360` | Pixel cap; still clamped to `availW - 16`. |
| `mobileFillHeight` | `false` | See [Mobile positioning](#mobile-positioning). |
| `showBackdrop` | `true` | `false` for lightweight, non-blocking popups (link preview) that shouldn't dim the whole reading view. |
| `lockMobileHeights` | `true` | Set `false` for a dialog with **no text field** — the mobile height-lock exists only to protect against the dialog's *own* keyboard, so for an input-less dialog it does nothing useful while introducing a race (see [Height locking](#height-locking-and-the-wkwebview-quirk)). |
| `zIndex` | `100000` | Bump this for a popup that must render above another already-open Orbis popup — see [Nesting one popup inside another](#nesting-one-popup-inside-another). |
| `onClose` | — | Called on every dismissal path (X button, Escape, outside click, or your own call to `close()`) — the one place to put cleanup, not just your explicit Cancel/confirm handlers. |

The caller owns its own single-instance tracking (an `xPopupEl`/`xPopupCleanup` field guarding re-entrant opens) — `createOrbisPopup` only manages one popup's own DOM/listener lifecycle, not whether more than one of *that dialog* can be open at once.

---

## Title icons

A dialog's heading may carry a glyph before its text (`opts.icon` for a popup, the `icon` chrome option for
an `OrbisModal`). The glyph is a **subsystem marker**, not decoration, and that shows up two ways:

- **Launcher continuity.** Tap the `Aa` on the toolbar and the dialog that opens wears the same `Aa`. Nothing
  has to be remembered about which dialog belongs to which control.
- **Nesting.** Two levels of one subsystem share a mark, so drilling from the glossary list into an entry
  never reads as having left for somewhere else.

> **A dialog carries its subsystem's glyph when it is a destination. Transient steps carry none.**

Confirms, name prompts, the remap step inside Change preset and the delete-note confirmation get nothing —
they are steps in a flow, and on a dialog that exists to ask one question a glyph reads as ceremony. The rule
is deliberately not "whatever opened it has an icon": Advanced search is opened by a text control and still
belongs to the search feature, so it wears the magnifier.

**Two standing constraints:**

- **Do not invent a glyph to satisfy the rule.** If a subsystem has no glyph, its dialogs go bare until it
  earns one. Inventing one per dialog is how an unreadable ten-glyph vocabulary gets built. A new glyph is drawn
  at true size against the *existing* set before it is adopted, because the hard part is not "what says this
  feature" but "what is distinguishable from the other nine".
- **A more specific mark wins.** The mark editor, nested inside the annotations dialog, does **not** get the
  `Aa`: its title is already `badge · name`, and the badge is a stronger subsystem signal than the `Aa`
  because it identifies the individual mark. A third element on that line would buy nothing.

**Size is pinned in CSS**, not by the caller: `.orbis-dialog-title .orbis-title-icon svg` forces 16px, so a
caller passing `annotationsSvg(14)` or `(20)` still matches every other dialog. Titles are 16px; the reader
toolbar is 14px.

### Which dialogs carry which glyph

| Glyph | Source of truth | Dialogs |
|---|---|---|
| `Aa` + squiggle | `annotationsSvg()` | Annotations, Marks overflow list |
| Pencil | `NOTE_ICON` (`AnnotationController`) | Add/Edit note, Note view |
| Open book | `LOOKUP_ICON` (`AnnotationController`) | Look up |
| Magnifier | `SEARCH_ICON` (`SearchController`) | Advanced search |
| Headphones | `HEADPHONES_SVG` (`system-glyphs.ts`) | Recordings & mixes, Voice & source, Listen needs a voice |
| `A` + sound waves | `glossarySvg()` (`pronunciation-editor.ts`) | Glossary list, Glossary editor, "Say … as" popup — and the look-up popup's **Pronunciation** button, which opens it |

Deliberately bare: every confirm and prompt, the mark editor (see above), and the merge/diff dialogs.

The look-up popup's **Pronunciation** button carries the glossary glyph, not a pencil: a pencil already means
*note* on three other surfaces in the same reader, so a pencil meaning *edit pronunciation* would be the exact
vocabulary collision this rule exists to prevent. The glossary glyph also makes the drill-down cohere — look-up →
Pronunciation → "Say … as" all wear the same mark.

---

## Mobile positioning

Two things decide how a popup sits relative to the keyboard-safe zone on mobile:

**Height reservation** (`mobileFillHeight`): by default, the popup is capped to the upper ~58% of the screen in portrait (~48% in landscape), permanently reserving room for a keyboard that might open. This is needed for dialogs that auto-focus a field the instant they open (go-to, note editor) — since the WebView won't tell us when the keyboard actually appears, the *entire* popup has to already fit above where it will be by the time it does. Content-heavy dialogs that don't auto-focus anything (Generate Notes, Export) set `mobileFillHeight: true` instead: the popup uses nearly the full screen and scrolls internally like an ordinary mobile web form. If the user later taps a field, the keyboard may cover part of it — but that's the normal type → dismiss keyboard → scroll pattern, not a case that needs defending against with a permanent height cap.

**Vertical position: there is no option.** Every popup opens at the top of the screen — `viewTop + MOBILE_DIALOG_TOP_PX` on a phone, `--orbis-pin-inset` on anything larger, which is where a Modal opens.

There is no option to open below the reader's own toolbar (`.orbis-toolbar`) instead. Opening at the top frees the height a lower field needs to clear the keyboard, and a per-dialog opt-in lets popups disagree about where they open by default rather than by decision. Nothing is lost by covering the toolbar, and Look-up gains something — below the toolbar it would read as anchored to the selection, which it is not.

Every content-heavy dialog (Generate Notes, Export, both merge dialogs, Device Locations, Notes File Picker) sets `mobileFillHeight`.

### Dynamic content (`reposition()`)

The mobile height cap is computed once, from the toolbar/viewport geometry — not from the popup's own content height. If a dialog's content changes height *after* opening (Generate Notes' collapsible "Advanced" section, Export's chapter-list toggling on/off), the cap doesn't automatically follow. Call the returned `reposition()` right after the DOM change:

```ts
advToggle.addEventListener('click', () => {
  advBody.toggle(this.advancedOpen);
  this.repositionPopup?.();
});
```

### Desktop positioning

**Desktop popups are centered on the window**, the same place Obsidian centers a `Modal`. One rule for both dialog families, because confirmations exist in both — `ConfirmModal` is a Modal, the "Replace existing notes?" confirm is a popup — so any disagreement means the same kind of question appears in a different place depending on which route reached it.

Popups center on the window, not on `host.contentEl` (the reader pane), even though that overlaps the sidebar. The backdrop is what settles it: a popup already draws Obsidian's own `.modal-bg` across the whole window, so centering on the pane would dim everything and then sit on a fraction of what it dimmed. Overlapping the sidebar is not a trespass for a surface that has already claimed the window.

A dialog is never placed by where you happened to click: that can land it somewhere useless.

#### The one exception, and the test for earning one

Everything else centers. A dialog earns an exception only by acting on **a specific thing you just pointed at, where losing the pointer's position costs you**.

| Exception | Why |
|---|---|
| `anchorRect` — the marks overflow off the annotation bar | It is a continuation of that bar. A menu that lands in the middle of the page reads as detached from the control that opened it. The only caller. |

Mobile is not an exception either. Pinning below the reader toolbar would not be a placement decision but an answer to the on-screen keyboard, which owns the bottom of the screen while Obsidian's mobile WebView refuses to resize for it; opening at the top answers that better. See [Mobile positioning](#mobile-positioning).

Look-up is **not** an exception. It is about a word rather than a spot: three sections tall, and anchoring it under a selection near the foot of the page either flips it or covers the sentence being read.

### Vertical: every dialog opens at `--orbis-pin-inset` and stays there

**No Orbis dialog is centered vertically.** Both families take their top edge from one CSS variable — `createOrbisPopup` reads it inline, `.orbis-modal-pin-top` pads the container by it — and cap their height at the viewport less *twice* it, so the same gap is left below as above and the content scrolls inside whatever remains.

Centering means the top moves by half of every height change. Almost every Orbis dialog has folds, or controls that appear when a switch goes on, so the thing that moves is whatever sits at the top — usually the control just clicked. A dialog that grows lifts its tab row by half the growth. Look-up does it without being touched at all: it opens saying "Looking up…" and grows when the senses arrive.

Pinning is unconditional, not an opt-in: an opt-in is a judgment call to get wrong on every new dialog, and a flag on one family and nothing on the other reproduces the horizontal split above. A two-line confirm pinned near the top of a large display can read as broken, which is why the inset is **8vh**: far enough down to read as placed rather than stuck to the ceiling, and the same for a confirm as for a dialog ten times its height.

**Nothing is measured.** A popup's content is built by its caller after `createOrbisPopup` returns, so there is no height to read at placement time; a version that waited a frame to measure would be wrong for every dialog that fills itself asynchronously, Look-up included.

**Modals pin on a phone too.** A mobile modal is near-full-height when it is long, so there is nothing to center, but not when it is short, and Marks is both: one tab can hold many marks and the other one. Centered, the shorter tab would open a third of the way down the screen while the longer one started at the top and ran off the bottom under Obsidian's navbar — so the tab row, the only way between them, would move several hundred pixels on the tap that switched tabs. The cap is what keeps the long tab on screen; the container's alignment is what keeps the short one from floating.

**On a phone the two gaps are different numbers, and that is deliberate.**

| | Off a phone | On a phone |
|---|---|---|
| Above | `--orbis-pin-inset`, 8vh | `MOBILE_DIALOG_TOP_PX`, a flat 30px |
| Below | the same 8vh | `--orbis-pin-bottom`: what Obsidian's navbar is standing on, measured at open |

A proportion is right where there is room to spare and wrong on a phone, where 8vh is ~64px taken off a list that was already scrolling. **30px is one constant, in `ui-utils`, that both families read**: the popup adds it to `viewTop`, `OrbisModal` writes it into the container's `--orbis-pin-inset`. A matching literal in the stylesheet would be two numbers meant to be one.

Below is not symmetrical because there is something down there. `navbarClearance` measures from the navbar's top edge, so it covers the pill and the system bar under it in both of Android's navigation modes and on a phone with a home indicator, and reads 0 where there is no navbar — a desktop, or focus mode — which falls back to the top inset. `ReaderPanels` stops the contents panel above the same bar by the same reading.

The two mobile branches in `OrbisModal.onOpen` win where they disagree, because they set the container inline and the pin sets a class: a `compact` dialog takes a smaller inset (24px) to clear the keyboard, and `fullScreenOnMobile` takes none at all.

**Popups follow the same two numbers**, so there is one placement rule per device rather than one per family. A popup reads the inset off a probe element, because a custom property reads back as its own token (`"8vh"`) rather than a length, and converting it in JavaScript would be a second copy of the unit arithmetic that could drift from the stylesheet — `readSafeAreaInset` reads `env()` the same way. What a popup does NOT share is the bottom: it caps itself against the keyboard instead, which is a different question and its own. See [Mobile positioning](#mobile-positioning) and [Height locking](#height-locking-and-the-wkwebview-quirk).

---

## Height locking and the WkWebView quirk

### The caret in a pinned dialog on iPadOS and iOS

On iPadOS and iOS, WebKit can fail to draw the insertion point in a focused text field of a pinned dialog. Typing works, and
a long-press summons the magnifier and positions the caret — which then vanishes the moment the finger lifts.

### It takes two conditions

The caret disappears only when both hold:

- **`position: fixed`** on the dialog itself.
- **The flex/scroll chain** `.orbis-modal-pinned` — a capped flex column whose `.modal-content` is a
  `min-height: 0` flex item — which `OrbisModal` adds on every device, a phone included (see *A phone too* in its
  comment). So an iPhone is exposed as an iPad is. Android is not WebKit.

WebKit paints the caret into a layer that does not account for the fixed containing block, so it lands off-screen.
Either condition alone is harmless. The trigger is the CSS, not the pin: a dialog pinned with `layout: 'none'`
still registers in the stack, applies no CSS, and keeps its caret.

An explicit `caret-color` does not help, and neither does `box-sizing: border-box` (which is kept, for an overflow
reason of its own).

### Anchoring in the modal container

`pinModalAboveKeyboard` anchors the dialog in `.modal-container` — already full-screen fixed — instead of setting
`position: fixed` on the dialog itself. Every other number means the same thing either way, so the geometry is the
same; what differs is that a focused field's ancestors include no fixed element.

One thing it has to handle: `.orbis-modal-pin-top` pads the container by `--orbis-pin-inset`, and `top` on an
out-of-flow child is measured from the **padding** edge, so the same `top` would sit 8vh below where `fixed` put it.
The container's top padding is zeroed while pinned and restored on release — which is what
`.orbis-fullscreen-modal` already does, for the same reason.

`fixed` survives as the fallback when no `.modal-container` is found. Every caller passes an Obsidian `Modal`'s
element so it always is, but the fallback is `fixed` rather than a broken absolute if that ever changes.

**Do not stop pinning on tablets instead:** the fractions in `pinModalAboveKeyboard` say why. A tablet in
**landscape** gets 0.56 of the screen, so the pin is doing real work there, and trading an invisible caret for a
dialog that can land behind the keyboard is the wrong direction. Anything that touches this wants the device in
hand, and has to be tested against tablet landscape and phone portrait both.

SYMPTOM IF SOMEONE CHANGES THIS: a pinned dialog's lower fields disappear behind the keyboard on a tablet in
landscape, or the dialog sits `--orbis-pin-inset` too low. Check both before believing a change here is safe.

`lockMobileHeights()` / `unlockMobileHeights()` (on `OrbisReaderView`) pin `contentEl`/`hostEl` to a fixed pixel height for the duration a popup is open, so Foliate's renderer doesn't detect a resize and reflow at keyboard-shrunk column widths — which would otherwise land the reader on the wrong page once the keyboard closes. `createOrbisPopup` calls these automatically; dialogs never need to call them directly (the places that do — Display Style number inputs, the standalone search bar, the sidebar search input — are per-input protections outside the popup system, unrelated to this).

These two methods, and the option that skips them, handle three cases:

**Race condition on fresh book load.** If a popup opens immediately after a book finishes loading (before Foliate's renderer has completed its first layout), `hostEl` can read a height of `0`. Locking to that measurement pins the reader pane to a bogus, too-small height for the rest of the popup's lifetime, showing as a black gap below the reader. `lockMobileHeights()` detects a zero-height `hostEl` and retries via `requestAnimationFrame` (up to 10 frames) instead of locking to it.

**Reference counting for nested popups.** If a second Orbis popup opens while a first one (sharing the same host) is still open — e.g. the "replace existing notes?" confirmation over Generate Notes — a naive second `lockMobileHeights()` call would capture the *already-locked* pixel height as the value to restore to later, permanently corrupting it. Both methods are reference-counted: only the first `lockMobileHeights()` call actually captures/locks, and only the matching last `unlockMobileHeights()` call actually restores.

**Keyboard-less dialogs launched from the command palette.** The lock freezes `contentEl`/`hostEl` to whatever they measure *at open time*. That's fine when a dialog opens from within the reader (the reader is at full height). But when a dialog opens from the **command palette**, the palette's own search keyboard is mid-dismiss as the command fires, so the lock can measure a **keyboard-reduced** height and freeze the reader short — a black gap below the reader that persists until the dialog closes. The zero-height retry above doesn't catch it: a keyboard-reduced height is non-zero, so it sails past the `hostEl.height === 0` guard. And it's a **race** — whether it happens depends on whether the keyboard has finished dismissing by the microsecond the lock measures,, so the same dialog can look fine one open and broken the next.

The answer for an **input-less** dialog is `lockMobileHeights: false` — skip the lock entirely. The lock only ever protected against the dialog's *own* keyboard, which these don't have, so skipping it removes the race outright: the reader is never frozen, so there's nothing to measure wrong. Note this is **not** the same as making the popup large (`mobileFillHeight`): a big popup like Device Locations merely *covers* the shrunk area so the gap isn't visible — it still shrinks the reader and still loses the race, it just wins it more often. Any keyboard-less `createOrbisPopup` dialog that can be launched from the palette (Device Locations, Notes File Picker, the merge dialogs) has the same latent race and is a candidate for `lockMobileHeights: false`; only About sets it.

---

## Popup stacking (nested popups)

A module-level stack (`openPopupStack`, in `ui-utils.ts`) tracks every currently-open Orbis popup — its `close`
function and its element, most-recently-opened last. Escape and outside-click listeners are still registered per-popup on `document` (there's no single global listener), but each one only acts if its own popup is the topmost entry on the stack — otherwise, with two popups open, a single Escape press or outside click would fire *every* open popup's listener and cascade-close all of them instead of just the topmost one.

### Nesting one popup inside another

The only case of this is Generate Notes' confirm-replace dialog. When intentionally opening a popup on top of another already-open one:

1. **Bump `zIndex`** above the default (`100010` works; the outer popup is at `100000`) — same-`zIndex` DOM-order tiebreaking between two sibling popups does not reliably put the later one on top, so don't rely on it.
2. **Freeze the outer popup** — set `pointerEvents: 'none'` on its *outer* `popupEl` (not just its content div — the title bar and close button live outside the content div returned to the caller) so its controls can't still be clicked from underneath. Dim it with `filter: 'brightness(0.6)'`, **not `opacity`** — opacity makes the popup's own solid background translucent too, letting the reader content and Obsidian's toolbar bleed through it. `filter: brightness()` darkens the element in place while its background stays fully opaque.
3. **Unfreeze in `onClose`**, not just the explicit confirm/cancel handlers, so it's restored regardless of how the inner popup was dismissed.
4. **Resolve before you `close()`**, not after, in any `Promise`-wrapped confirm flow: `close()` synchronously fires `onClose`, and if that also settles the same promise (e.g. `resolve(false)` for "any other dismissal"), it will beat a `resolve(true)` called *after* `close()` — only the first `resolve()` call on a promise has any effect.

### Who gets the keyboard when a popup closes

A closing popup hands focus back to whatever opened it — Obsidian does this for a `Modal`, and `createOrbisPopup`
does it for a popup, because a keyboard left on `body` walks the page *behind* an open dialog with Tab. Three rules
govern it.

- **A handover is decided by stack position, not by "is anything still open".** A dialog that opens a second dialog
  and closes itself (the listen panel opening "Manage recordings & mixes") must *not* pull focus back to the button
  that opened *it*, behind the dialog now on screen. But a confirm closing over the dialog that raised it is the
  opposite case, so the coarse rule — any popup still open means a handover — would suppress the focus return every
  time, dropping the keyboard on the document instead. `popupHandedOver(stackIdx, remaining)` is the rule: skip the
  restore only when a popup opened *after* this one survives it. It has its own function and its own test because
  getting it wrong produces the exact symptom it exists to prevent.
- **A claim on a detached element lands nowhere.** `claimFocusSoon` bails when its target has left the document, and
  the button that opened a popup is often replaced by the action it started: confirming a recording run turns
  *Generate* into *Stop*, leaving nothing to claim. So when the opener
  cannot be found, the popup still on screen catches the keyboard on its own frame — `captureFocus`'s "never leave the
  keyboard on `body`" rule, applied across two surfaces rather than within one.
- **A named successor must be allowed to beat that net.** Landing on the dialog frame is a floor, not a destination:
  the button that *replaced* the one you pressed is where the reader actually is. Both claims are scheduled for the
  same tick and the frame's runs first, so a dialog claiming its successor has to treat the frame as vacant too — see
  the Stop claim in `RecordingsModal.onGenerate()`.

**Diagnosing a focus fault:** a temporary `focusin`/`focusout`/`keydown` trace in the dialog itself separates "the
dialog never took focus" from "something took it away later". Reach for it early: `document.activeElement` at open,
a few timed samples, and every focus event with its `relatedTarget`, is usually the whole answer.

---

## Which dialogs use `createOrbisPopup`

| Dialog | File | `mobileFillHeight` | `dismissOnOutsideClick` | Notes |
|---|---|:---:|:---:|---|
| Go To | `OrbisReaderView.ts` (`openGoToDialog`) | | ✓ | Auto-focuses its field on open |
| Note Editor (Add/Edit note) | `reader/AnnotationController.ts` (`openNoteEditor`) | | | Deliberately no outside-click dismiss — would lose unsaved text |
| Link Preview | `reader/LinkPreview.ts` | | ✓ | `showBackdrop: false`, `zIndex: 2147483647` (must render above the iframe content it previews) |
| Generate Notes | `OrbisReaderView.ts` (`GenerateNotesModal`) | ✓ | | |
| Export to Vault | `BookExportModal.ts` | ✓ | | |
| Merge Notes (single-file diff) | `NotesDiffModal.ts` (`FileDiffModal`) | ✓ | | No text field — safe to widen with zero keyboard-coverage tradeoff |
| Per-Chapter Merge | `NotesDiffModal.ts` (`PerChapterMergeModal`) | ✓ | | Same reasoning as `FileDiffModal`; recursively opens `FileDiffModal` for individual file review |
| Device Locations | `OrbisReaderView.ts` (`DeviceLocationsModal`) | ✓ | ✓ | No text field; passive select-a-device list |
| Notes File Picker (Open notes) | `OrbisReaderView.ts` (`NotesFilePickerModal`) | ✓ | ✓ | No text field; passive select-a-file list |
| About | `AboutDialog.ts` (`openAboutDialog`) | | ✓ | `lockMobileHeights: false` (no text field, launched from the palette — see [Height locking](#height-locking-and-the-wkwebview-quirk)). The only dialog opened from *outside* the reader view: it uses the active reader as host when present, else a synthesized `{ contentEl: activeDocument.body, no-op locks }` host so it works with no book open |
| Replace existing notes? (confirm) | `OrbisReaderView.ts` (inside `GenerateNotesModal`) | | | Nested inside Generate Notes' own popup — see [Nesting one popup inside another](#nesting-one-popup-inside-another) |

---

## Dialogs that stay as a real `Modal`

A dialog opened from inside Obsidian's own Settings window cannot be a popup. Settings is itself a `Modal`, and Obsidian traps keyboard input for anything outside its recognized DOM tree; a `createOrbisPopup` dialog is a plain `position: fixed` div on `document.body`, entirely outside it. It renders on top and can be focused, but **keystrokes never reach it**.

Note what the blocker is *not*. `OrbisPopupHost` is only three members, and `AboutDialog` uses a synthesized host (`{ contentEl: activeDocument.body, no-op locks }`). The host is easy; **focus containment is the wall.** Any dialog with a text field that opens from Settings has to be a real `Modal`.

### `OrbisModal` — the base class for real `Modal`s

`src/OrbisModal.ts` gives every such dialog the same chrome by construction. Subclasses implement
`dialogTitle()` and `renderDialog()` rather than overriding `onOpen()`, so a new dialog cannot be written
*without* the chrome — the body is only reachable from the callback that runs after it is in place.

| Member | Purpose |
|---|---|
| `dialogTitle()` | The heading text. |
| `renderDialog()` | Build the body into `contentEl`. Runs with the chrome already applied. |
| `refreshTitle()` | Re-render the heading, for a dialog whose title tracks what it is showing. Override it for a heading that is more than text (the mark editor's `badge · name`). |
| `titleRowEl` | The heading element, for those overrides. |
| chrome `{ icon, compact }` | `icon`: see [Title icons](#title-icons). `compact`: tight spacing, capped width, and top-anchored on mobile — the container's `orbis-modal-compact-top` class, shared rather than set per dialog. |

**`openOrbisDialog(app, opts, build)`** is the same thing for a one-off dialog built inline — a confirm, a
name prompt, a small picker. There are no bare `new Modal(` call sites outside `OrbisModal.ts`: chrome that has
to be *remembered* after each `new Modal(app)` is the pattern the base class exists to escape. The builder receives `(body, close, modalEl)`:
`close` so a handler never captures the dialog, and `modalEl` for the one thing a body cannot do for itself,
`pinModalAboveKeyboard`.

### Replacing Obsidian's header chrome

`replaceModalChrome()` hides Obsidian's own header bar and close ×, then adds the popups' flat ×. It is the
one part of this system that depends on Obsidian's **private** DOM, so it is written to fail safely — and two
plausible approaches are both wrong:

- **`.modal-close-button` does not match anything here**, despite being the documented name, so a
  `display: none` rule on it is a no-op. What is actually there is
  `div.modal-header-button mod-raised clickable-icon` — a `div`, not a `button` — plus a `div.modal-header`
  bar, which is what pushes the heading down the screen.
- **Rendering our own × and hiding theirs by class** cannot work when the class differs by platform. Hiding is
  by **element reference** instead, so a duplicate is impossible: we hide the exact elements we found.

The failure mode is inverted on purpose. Known classes are tried first; the shape-based fallback (the one
icon-bearing child that is neither the heading nor the content) fires only when there is **exactly one**
candidate, because two means Obsidian has grown chrome we cannot name — a back chevron, a pin, a drag handle
— and hiding a control we cannot identify is the outcome this guards against. Recognizing nothing means hands
off: Obsidian's chrome stays and ours is not added.

**Symptom when it breaks:** an Orbis dialog shows Obsidian's own × (a filled chip on mobile) instead of the
flat one, and its heading sits below an empty bar. Update the class list from the live DOM; do not widen the
fallback.

**Diagnosing it:** instrument, don't infer — dump the actual children of the modal and its container into the
dialog itself, rather than reasoning about which class name should match.

### `pinModalAboveKeyboard()` — the general Modal-side fix

The top-anchored container above is the minimal version. `ui-utils.pinModalAboveKeyboard(modalEl, heightLock?)` is the full one, used by the **glossary manager**, the **glossary editor**, and the **annotation-mark editor** — all real `Modal`s with text fields that must survive the keyboard. Call it from `onOpen()` and invoke the returned cleanup from `onClose()`.

Five rules govern it, and they all apply to any future Modal that does this:

1. **Pin only while a text field is focused, never at open.** The height cap (66% of a tablet's screen) leaves the bottom third of Obsidian's `.modal-container` exposed — an opaque black band, visible with no keyboard involved. The pin latches on the first `focusin` of a text field.
2. **Set all four offsets, not just `top`.** `position: fixed` takes the modal out of the flex container that was centering it, and a half-positioned fixed element keeps its remaining offsets from the layout it just left. Needs `left`/`right`/`margin-inline: auto` (which re-centers without imposing a width, so the modal's own `max-width` still governs) and `bottom: auto`.
3. **Hide the `.modal-container`, not the `.modal`.** When a child dialog stacks on top, the parent is hidden so the two cannot overlap — Obsidian decides modal stacking and a repositioned `fixed` parent does not reliably lose to a later sibling. Hiding `.modal` collapses the dialog to 0×0 but leaves its `mod-dim` container full-screen, so the backdrop remains and the screen dims twice. Requires `setImportantStyle`: Obsidian declares modal `display` with `!important`.
4. **Never release on focus LOSS.** Android does not reliably keep a freshly-opened dialog's input focused, and the keyboard cannot be detected at all (see the WkWebView quirk above), so "focused right now" is not a proxy for "keyboard is up". Releasing on blur drops a dialog from the top back to center mid-edit. The pin holds for the dialog's lifetime once earned.
5. **Take the reader-pane height lock once, for the dialog's life** — not per pin. Tied to the pin it is released and re-acquired on every hide and unpin, and in those gaps the WebView reflows while the keyboard is up, so the next lock freezes an already-collapsed pane. That is the black band again, on the return path. `ReaderDom` ref-counts, so nested dialogs each holding one is fine.

**Pass the `heightLock`.** It is optional only because a Modal can be opened with no book behind it. Without it the reader pane collapses when the keyboard opens and leaves a black gap for the dialog's lifetime — the same failure `OrbisPopupHost.lockMobileHeights()` exists to prevent for popups. `IOrbisReaderPlugin` satisfies the shape and forwards to every open reader view.

Stacked dialogs coordinate through a module-level registry in creation order: only the topmost is shown, and each re-evaluates whenever any other registers, unregisters, or changes state.

**Diagnosing this class of bug:** instrument, don't infer. The failures are interactions with Obsidian's chrome that aren't visible in our source, so log the computed style and bounding boxes of the dialog *and its parent* — rule 3 reads as `computed="none" box=0x0` beside a full-screen `parentBox`. When a symptom survives fixes that each should work, the question is "what exactly is still on screen", not "is my logic right".

### When NOT to pin

**A dialog that is full screen on a phone must not pin.** `fullScreenOnMobile` already answers the keyboard: the
dialog owns the screen, so there is no centering to lose and nothing for the keyboard to cover that scrolling cannot
reach. Pinning on top of it applies the height cap anyway, and the cap does not come off when the keyboard closes —
so focusing a field near the bottom jams the dialog and dismissing the keyboard leaves it jammed.

The rule that falls out: **pin a compact dialog whose field is near its top; give a growing dialog tabs instead**
(below), which puts every field near the top of a short screen without taking the modal out of flow.

### `reserve` — the third answer, for a form

`pinModalAboveKeyboard(modalEl, heightLock?, { layout: 'reserve' })` takes the same latch, the same stacking
registry and the same height lock, and **changes no geometry at all**: the keyboard's share becomes bottom padding
on the scrolling body, so every field can be scrolled clear of it while the dialog keeps the shape it opened at.
Each field is brought to the middle of the visible strip as it takes focus.

**`reserve` does not change the frame.** A dialog that opens at its natural size and becomes the whole screen the
moment a field is tapped gains nothing anyone can see — on a tablet, where there is room to spare, least of all.
The reserve is the half that does the work.

**The height cap is a bug for anything you work DOWN.** A form has fields below the fold by definition, so capping
it at 58% of a phone screen hides most of it — and because rule 4 latches the pin, dismissing the keyboard does not
give the space back: tap a field and the dialog halves; close the keyboard and it stays halved. Lifting is the
default for the shape it was built for — one field and two buttons, where a cap costs nothing.

`reserve` is also what a `fullScreenOnMobile` dialog should use if it ever needs keyboard handling: that dialog
already holds its shape from CSS, and the reserve adds only the padding, so the two cannot fight.

**A dialog whose buttons live in a footer reserves the space differently.** `OrbisModal.footer()` puts Save and
Cancel beside the scrolling body, so padding inside the body cannot lift them — at the bottom of a full-screen
dialog they would sit under the keyboard, which is the failure lifting exists to prevent. For those, the reserve
goes on the dialog itself and is **released when nothing is focused**, since a permanent band of dead space with
the buttons floating halfway up the screen is worse than the moment of movement. The frame never moves either way.

**A dialog that owns its own scrolling layout wants `none`.** `pinModalAboveKeyboard` takes
`{ layout: 'lift' | 'reserve' | 'none' }`, and `none` applies no styles at all — it only registers the dialog in
the stack, so a child dialog opening on top still hides it. The mark editor is one: its `.modal-content` is capped
at `70vh` with a separate inner scroller, so filling would give a full-height dialog showing 70% of a screen and an
Appearance tab that could not show itself, while lifting would halve it on first focus.
It needs neither — every text field is at the top of its first tab, where the keyboard covers nothing.

Since `reserve` touches no geometry, the distance between it and `none` is one property: whether the scroller
gains room to scroll the focused field clear of the keyboard. A dialog with nothing below its last text field can
still take `none`.

**Who uses which:**

| `reserve` | lift | none |
| --- | --- | --- |
| EPUB export (all three stages), sync setup, glossary manager, glossary entry editor | New folder, preset rename, collection editor | Mark editor, catalog review |

Marks PDF is on neither list: it is a `createOrbisPopup`, which sizes itself at open and never reshapes.

The three that lift are one field and two buttons each — the shape lifting was built for, where a cap costs
nothing and full screen would be heavier than the problem. New folder also opens *on top of* other dialogs, and
full screen there would misstate which dialog you are in.

Catalog review keeps the bare call rather than declaring `none`, because it **has no text field**: nothing it
does can engage a layout, and the registration is all it needs.

### Explicitly out of scope

`SwitchStyleModal` (`main.ts`) is a `FuzzySuggestModal` subclass — Obsidian's built-in fuzzy-search list picker component, a different UI paradigm from the compact title/content/buttons dialogs this system targets, and it does not need this system.

---

## Lists inside dialogs

These conventions apply to every list of editable rows, in a settings page or in a dialog.

### A row is edited by a pencil, and the row is clickable too

**The pencil leads the row's controls; the row's text opens the same editor.**

The pencil is the affordance and the tap is the shortcut, because **there is no hover on a phone**: a row whose only
affordance is a tooltip has none on the device where rows are hardest to hit. The tap is what a wide row invites
anyway, and costs nothing to keep.

**Registering the tap has to be idempotent.** Obsidian's declarative settings re-run a row's `render` callback
against the SAME `settingEl` whenever the page refreshes, so a listener added per call becomes a listener per
refresh: a tap opens editors stacked on each other, and the stale one underneath, saved, writes its old state back
over the change just made. `openOnRowTap` registers once per element and looks the handler up at click time, so
the newest render's closure wins. `settings-row-tap.ts` is its own module so a test can see it, because nothing
about a row on screen says how many times it was registered.

- **Obsidian `Setting` rows**: `openOnRowTap(setting, open)` in `OrbisSettings`. It ignores clicks inside
  `.setting-item-control`, or a tap meant for a toggle would open a dialog behind it, and adds `orbis-openable-row`
  so only the text side takes the control cursor.
- **Hand-drawn rows**: the text is already a `<button class="orbis-rule-text">` with an `aria-label`; add the pencil
  beside the other controls.
- **Navigation is not editing.** A row that opens a book or jumps to a location stays a plain click with no pencil.

### A list holds no text inputs

**Rows are read-only; editing happens in a dialog of its own.** The annotation presets' comment says why — *"This list holds no text inputs, so it can never raise one… That reservation is the editor's to
pay, not the list's."*

The cost of ignoring it: a field can have dozens of values, and a list of that many live text components is slow to
open, and on a phone the one you tapped is behind the keyboard.
`ValueModal` and `RuleModal` are the pattern — one row's worth of fields, opened from the pencil.

Two consequences worth knowing:

- **Adding a row opens the editor too.** An empty row has no name to show in a read-only list, and in the values
  list the empty string is already taken — it is the "no value" row — so an empty row would be a second copy of
  that one and could not be respelled.
- **Long moves belong in the editor.** Arrows walk one row at a time and dragging across dozens of rows fights the
  scroll, so the value editor carries *Move to top* and *Move to bottom*. Paging and filtering do not help: the
  order IS the setting, and neither one page of rows nor the few that match a search can be dragged into an order
  that means anything.

### A control that redraws its dialog must keep the keyboard

**Changing a value must leave focus on the control you changed.**

Redrawing on change is often right — choosing a collection changes which questions a widget dialog asks, and a
half-relevant form is worse than a redraw. What is never right is losing the reader's place while doing it. So a
dialog that redraws from a control's `onChange` goes through `rebuildKeepingFocus` (or `captureFocus` directly, when
the repaint also restores a scroll position), and its controls carry `data-orbis-focus` keys.

**Keys beat the path fallback wherever the shape changes.** `captureFocus` records both an identity key and a DOM
path, and falls back to the path when no key is found — which is enough for a dialog whose layout above the changed
control stays put, and not enough for one where choosing a different kind adds and removes whole rows. The widget
editor keys all twelve of its controls (`kind`, `collection`, `view`, `count`, `expand`, `pool`, `order`, `totals`,
…) for exactly that reason.

The widget editor, the reading-records dialog, the records destination and library setup dialogs, and the settings
lists all do this. **Any new dialog that redraws on change owes the same.**

### A key handler that acts must `preventDefault()`

**Otherwise the press still has a default action left over, and by then the ground may have moved.**

The sequence, when a handler repaints synchronously:

1. Enter in a search field runs our handler, which calls `search()` **synchronously**.
2. `search()` repaints the dialog before the request goes out, to show it is busy — so the input the key was pressed
   in no longer exists.
3. The keyboard lands on the chrome ×, and Chromium's leftover default action for that same press activates
   whatever is focused: a click with `isTrusted: true`, `detail: 0`, no coordinates.

`preventDefault()` and `stopPropagation()` prevent it. Every Enter handler in the plugin calls both — the note
editor, go-to bar, glossary, recordings, New folder, style name and pronunciation editors, and the book sources
browser.

Two things worth carrying:

- **A repaint inside a key handler is a trap**, because the element the key was aimed at is gone before the browser
  has finished with the key. Preventing the default is the cheap fix; not repainting synchronously is the other one.
- **The keyboard must never rest on the close ×.** `captureFocus`'s fallback skips it: a dialog whose focus is on
  Close is one Enter from vanishing, whatever the cause. The same reasoning already keeps it last in the tab order.

**A trusted `detail: 0` click is not a form submission.** It means "the browser activated something for a key",
and the dialog has no form and no submit button. The ×s say `type="button"` as hygiene, not as the fix.

### A child dialog's Save must not rebuild the list it opened from

**Rebuild the list AFTER the child has closed, never during its save.** Otherwise saving leaves the keyboard nowhere
near the dialogs — out in the settings window behind, which may also navigate to a different tab — while Cancel on
the same dialog is faultless.

The mechanism applies to every list that opens an editor:

1. Obsidian remembers what was focused when a dialog opens — here the row's pencil — and restores focus to that
   element **after** `onClose` has run.
2. A child's Save that calls back into the list, and a list that rebuilds itself immediately, destroys the pencil.
3. Obsidian's restore then has a detached element to focus, so focus falls to `<body>` — and from there whatever
   the host does next (a settings repaint, a scroll into view) decides where the keyboard ends up.

Cancel is unaffected *because* it rebuilds nothing: the difference between the two paths is not the dialog, it is
what the parent does when it closes.

So a list does two things:

- **Defer the rebuild by a macrotask** (`win.setTimeout(..., 0)`) so it runs after the close and after Obsidian's
  restore. See `openWidget` in `src/WidgetModal.ts`.
- **Key the row's pencil** (`data-orbis-focus="pencil:<id>"`, which `renderReorderList` does for every action), so
  when our own rebuild follows a moment later, `rebuildKeepingFocus` puts the keyboard on the same row's pencil
  rather than dropping it.

**The page underneath needs the same treatment, twice over.** A dialog's save also asks the settings page to redraw,
and that redraw is deferred until the last dialog closes (a page must not repaint behind an open dialog — it takes the
keyboard). Two things in that path return the keyboard to the pencil:

- **The flush runs a macrotask after `onClose`, not inside it** — `OrbisModal.onClose` defers the `afterLastClose`
  callbacks — so the redraw does not destroy the pencil before the host's restore aims at it.
- **Focus is captured inside the deferred callback**, when the host has already put the keyboard back on the row's
  pencil. Captured at the top of `saveAndRefresh`, while the dialog is still open, it would record the dialog's own
  Save button, and restoring that after the dialog closed would fall back to the first control on the page.

The general shape: **let the host finish with focus, then capture, then rebuild.** Anything that reads
`activeElement` while a dialog is open is reading the dialog's focus, not the page's.

Two things NOT to try: racing the restore (focus later, focus again on the next frame, watch
`focusin` and pull focus back) never wins reliably, because the winner is decided by whatever the host schedules
after us; and a `MutationObserver` claiming focus back is the same race wearing a callback. **Do not fight a host's
focus restore — leave it something valid to restore to.**

### Tabs when a dialog outgrows a screen

`ui-utils.renderTabRow(parent, tabs, active, onPick)` — one strip, shared by the annotation presets (book/preset
scope), the mark editor (general/appearance), the field editor (field/values), the collection editor (filters/group
by and sort) and the widget editor (general/view).

- **Tabs are for a dialog that does not fit, not for one with several settings.** Hiding a control someone is
  looking for costs more than a scroll. The field editor earns them with a long values list; the widget editor with
  a number field that a phone keyboard lands on top of.
- **One tab is not a choice** — render no strip at all when only one section exists.
- **A tab holding one control is a tab you land on and leave.** Group by is one dropdown and shares a tab with
  Sort by.
- **Identity and live feedback sit outside the strip.** The collection's name and its "matches N titles" count, the
  widget's heading. A name is what you are editing rather than one of its settings, and a count that changes with
  two different tabs must not live on one of them.
- **Name a tab for what is in it.** "Group by and sort" over "Arrangement": the long label is legible before it is
  clicked, and two tabs leave room for it even on a phone.
- **The strip owns which tab is showing.** It tracks its own state and moves the highlight itself, so a caller that
  redraws only the body — the sensible thing — does not freeze the highlight or make clicking back to the first tab
  a no-op.

---

## A destination's name field

Six dialogs ask where a file goes and what it is called: Generate notes, Save as Markdown, Save as PDF and the three
EPUB conversions. All six draw the pair with `destinationGrid` (`src/folder-picker.ts`) — a folder picker and a name
field, inside a **Save to** fold whose header is the resolved path.

**An emptied name means the default.** The field shows the name the dialog opened with as grey placeholder text, and
the dialog carries on with that name: the fold's header, the "already exists" check and Save all see the default
path. Only the name falls back; a folder the reader picked stays picked. A name made only of spaces, or only of
characters a file name cannot hold, counts as empty.

- **One rule, in the shared field, because six dialogs had answered it three ways.** Generate notes disabled Save and
  reported the vault root as a folder that already existed (`normalizePath('')` is `/`). Save as Markdown wrote
  `exported-book`. Separate EPUBs fell back to the source folder's own name, which beside the notes is the folder
  they are in. The others fell back correctly but showed no hint of it.
- **The dialog supplies the default as a function**, because it can follow a switch: Generate notes' default is the
  note style's file name or folder name, whichever the format writes.
- **The emptied state is kept beside the fold's open state (`FilingState`).** These dialogs rebuild themselves on
  nearly every change, and a rebuilt field is filled from the name in play — for an emptied field, the default — so
  without it the grey hint would turn into typed text the moment another control was touched. Generate notes clears
  it on a style or format switch, since the field then edits a name the reader did not empty.

---

## Backlog: one pass over every dialog

Driving the dialogs from the keyboard makes their focus behavior visible in a way clicking never does.

**The settings half of this is absorbed into [Settings](settings.md#keyboard-focus-and-tab-order)**, which checks
focus, tab order and the focus ring on each page as it is built rather than auditing them afterwards. What remains
here is every dialog that is not a settings page.

**Four faults, all of them cosmetic to a mouse and disqualifying to a keyboard.**

**1. There is no focus standard.** Three different indicators are on screen at once. The mark swatches take a
purple ring — `--interactive-accent`, on the colored dot rather than the button,
since `border` and `box-shadow` are forced off there so the dot can carry the appearance. The note editor's
textarea takes Obsidian's own brighter outline. The pencil on the PDF dialog takes a gray box, being an Obsidian
`Setting` component with default styling. Nothing is *wrong* in isolation; together they read as three unrelated
apps, and a reader tabbing through cannot learn what "focused" looks like.

The fix is one token and one rule — probably the accent ring, since that is what a reader will meet most often —
applied to Orbis's own controls, and a decision about whether to restyle Obsidian's components or leave them
alone. Leaving them alone is defensible: matching the host app is a kind of consistency too. What is not
defensible is the current state, which matches neither.

**2. Initial focus is not always the useful control.** Some dialogs place it deliberately — the note view's pencil,
so Enter edits; the all-marks list on the mark already in use — and others land wherever the DOM happens to put
it. Each dialog should name the control a reader most likely wants, and Enter should do the safe thing there.

**3. Tab order is not audited.** `createOrbisPopup` traps Tab inside the dialog, so nothing escapes into the
page behind, but the *order* within each one is whatever the DOM gives. Where a dialog rebuilds part of itself —
the mark bar does, on every pick — focus has to be put back deliberately or it is lost mid-task.

**4. Anything styled twice will drift, and only a side-by-side look will catch it.** Dialogs come in two
families — real Modals (`OrbisModal`, `openOrbisDialog`) and popups over the reader (`createOrbisPopup`) — and
each one's surface, spacing and chrome is decided in its own place. **Backgrounds** show how: only a Modal can
inherit a surface, a popup floats over the book and must name one, so a change to how Modals get their background
silently moves half the dialogs and leaves the other half behind. Only a side-by-side look shows it; no test or lint
can.

That is the same shape as fault 1. A focus ring defined per control and a background defined per family are the
same bug: **one appearance, two definitions.** So this pass is not only about the keyboard. For each of surface,
focus ring, corner radius and padding, the questions are the same — is there one token, is it named in one place,
and does a dialog that cannot inherit name the same one as a dialog that can?

The rule for backgrounds applies to the rest: choosing a theme token is not
hardcoding, and choosing a *different* token per surface is the thing that goes wrong.

**And one duplicate to fold in while there.** Three confirm dialogs build the same shape by hand — a message, a
Cancel and a destructive button in `.orbis-note-delete-btns` — in `RecordingsModal` twice and `AnnotationController`
once, and they differ in exactly the places this pass is about: one keeps a reference to its confirm button so
focus can land there and the others do not. A shared `confirmPopup` helper belongs to the standard rather than
ahead of it, since the standard decides what it should do about focus.

**Suggested shape**: settle the standard first, since it is one CSS decision that most dialogs then inherit; then
walk the list in [Which dialogs use `createOrbisPopup`](#which-dialogs-use-createorbispopup) and
[Dialogs that stay as a real `Modal`](#dialogs-that-stay-as-a-real-modal), opening each from the keyboard alone and
recording where focus lands and where Tab goes. A dialog you cannot complete without the mouse is the bug being
looked for.

---

## Adding a new Orbis dialog

1. If it's opened from inside the reader view (or anywhere that isn't nested inside Obsidian's own Settings `Modal`), build it on `createOrbisPopup`. Pass `this` (or the relevant host object) as `host`.
2. Pick `mobileFillHeight` based on whether the dialog auto-focuses a field on open (leave it off — it needs the full keyboard-safe reservation) or not (content-heavy, no auto-focus — set it). There is no positioning option to pick: every popup opens at the top of the screen. If the dialog has **no text field at all** and can be launched from the command palette, also set `lockMobileHeights: false` to avoid the keyboard-dismiss race ([Height locking](#height-locking-and-the-wkwebview-quirk)).
3. Pick `dismissOnOutsideClick` based on whether the dialog holds in-progress state worth protecting.
4. If it's opened from inside the Settings tab, or otherwise needs a text field in a real `Modal`, extend **`OrbisModal`** (or call **`openOrbisDialog`** for a one-off) — do not use `createOrbisPopup`, and do not write `onOpen()` or a bare `new Modal(app)`. Pass `compact: true` if every field *and* its action buttons must clear the keyboard, `fullScreenOnMobile: true` if it grows a row at a time, and `dismissOnOutsideClick: false` if a stray tap on the backdrop would throw away work — the same option name and default `createOrbisPopup` takes, for the same decision.
5. If it holds a list of editable rows, read [Lists inside dialogs](#lists-inside-dialogs) before drawing one: a pencil leading the controls, no text inputs in the rows, and tabs only once it stops fitting.
6. Give it an `icon` only if it is a destination in a subsystem that has a glyph — that subsystem's glyph, not a new one, and none on a transient step — see [Title icons](#title-icons).
7. If it needs to open *on top of* another already-open Orbis popup, read [Nesting one popup inside another](#nesting-one-popup-inside-another) first.
