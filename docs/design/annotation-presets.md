# Annotation Presets

← [Design Docs](README.md) | Roadmap: [§8.2](roadmap.md#82-annotation-presets--user-defined-marks-and-meanings)

Design for user-defined annotation appearance that carries *meaning* — "green is follow-up", "red
needs editing" — instead of five fixed swatches that mean whatever the reader remembers they mean.

Every book is given a preset on open, copied into its `.orbis` file; annotations render from it in the mark's
color *and* treatment, and carry both a `markId` and the treatment that mark had; the manager edits either the
shared preset or **this book's own copy**; and the reader picks marks by name and shape on the mark bar rather
than by color.

Read §"Per-mark tracking" before changing anything about how a book's copy relates to its preset.

---

## Vocabulary

Settled deliberately, because three of these words are already taken elsewhere in Orbis.

| Term | Is | Is not |
|---|---|---|
| **Annotation preset** | A named set of marks, authored globally and assigned to a book | Not a `DisplayStyle` (reading appearance) or a `NoteStyle` (export format) — "preset" occupies the same *named bundle of settings* slot without reusing the word **style**, which those two already own |
| **Mark** | One entry in a preset: a name, a color, a treatment, an optional badge | Not a "label" — chapter labels, voice labels, button labels and `RecordingSectionStatus.label` already make that word ambiguous here |
| **Treatment** | *How* a mark's line is drawn: underline, squiggle, box… | **Not the color.** Color and treatment are independent axes; a mark picks one of each |
| **Highlight** | The annotation *kind* — a `Highlight` record, what a user means by "12 highlights" | Not a treatment. The background wash is the **"Highlighter"** in the UI |

That last row is the one to hold on to. Once a mark can be an underline, "highlight" as both an annotated passage
and a background wash would make *"a highlight drawn as an underline"* a sentence someone has to parse. The
annotation kind keeps the name, because it is the persisted `.orbis` `highlights` key; the wash gets its own.

---

## The idea in one paragraph

An **annotation preset** is a named set of **marks**; each mark is a name, a color, a **treatment**
(highlighter / underline / squiggle / …) and an optional **badge**. Presets are authored globally
(Settings → Reading) and **one is assigned per book**. The assigned preset is written into the book's
`.orbis` file, which is the **source of truth for that book** — the global copy is a template.
Annotations then carry both a durable mark reference and their rendered color, so an annotation can
say what it *means* in the Saved pane, in the annotation picker, and in exported notes.

## Why the book owns its preset

Annotations referencing a global preset by id alone would break the moment the preset is deleted, edited, or
absent (a book shared from another vault). Copying the resolved preset into `.orbis` buys three things:

- **Deleting a global preset can never break a book.** No in-use check, no cascade, no orphans.
- **A shared book carries its own meaning.** [§8.6](roadmap.md) works with no coordination between
  vaults: the recipient sees the author's marks without importing anything.
- **Per-book customization is natural**, not a special case — the book's copy is *supposed* to differ.

The cost is that a book's copy and its preset are two objects, and the rules for how changes move between them
are §"Per-mark tracking" below.

---

## Data model

### Global (plugin settings, synced as its own type)

Mirrors `NoteStyle` deliberately — same shape, same CRUD affordances.

```typescript
export interface AnnotationPreset {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: number;
  /** Bumped on every edit. What a book's copy compares against. */
  revision: number;
  /** ORDERED. Array position is the order — see "Mark order" below. */
  marks: AnnotationMark[];
  noteMarkId?: string;    // role marks — see "Role marks"
  audioMarkId?: string;
  inactive?: boolean;     // kept out of assignment lists — see "Inactive presets"
}

export interface AnnotationMark extends MarkAppearance {
  /** Stable within the preset. Never reused after deletion. */
  id: string;
  name: string;
  /** Optional badge leading this mark in exported notes — see "Badges". */
  badge?: string;
  /** Retire a mark without breaking the annotations already using it. */
  enabled: boolean;
}

export type Treatment =
  | 'underline'          // Overlayer.underline
  | 'double-underline'   // custom; see "Treatments"
  | 'squiggle'           // Overlayer.squiggly
  | 'strikethrough'      // Overlayer.strikethrough
  | 'box';               // Overlayer.outline
```

### Two channels, not one

A mark has an independent **highlighter** and **line**, each with its own color, and at least one must be
present:

```typescript
interface MarkAppearance {
  highlightColor?: string;    // the wash. Absent = none.
  treatment?: Treatment;      // the line. Absent = none.
  treatmentColor?: string;
}
```

So "yellow highlighter with a green underline", "no highlighter with a red underline", and "green
highlighter with a blue box" are all expressible.

The reason is not the extra combinations — it is that a wash is not a peer of `underline`. One paints behind
the text, the others draw on it, and one radio group would force a choice between things that do not compete.

Consequences, each of which is a decision:

- **Uniqueness is on the whole appearance** — wash color, line kind, line color — because two marks that render
  identically are indistinguishable.
- **A mark with neither channel draws nothing**, and the type cannot express "one of these two", so the
  editor refuses to turn the second one off.
- **Both channels compose into one overlay entry.** `drawForAppearance()` returns a draw function that
  builds one `<g>` holding the wash group and the line group. Two entries would mean two keys for one
  annotation — two things to remove, two hit-test results, doubled note-icon bookkeeping — and foliate's
  own draw functions already return a `<g>`, so nesting is free. The wash draws first, the order a person
  would use a highlighter and a pen.
- **Previews use two CSS variables** (`--orbis-mark-fill`, `--orbis-mark-line`) and compose their classes,
  so one span can wear `is-fill is-underline`. `applyMarkPreview()` is the single place that does it, shared
  by the chips, the list rows, the editor sample and the overflow list.
- **Marks written in the one-channel shape migrate on read**, via `migrateMark()`: `fill` becomes the wash, any
  other treatment becomes the line in that same color. Converted on read rather than rewritten once, because the
  shape lives both in the settings library and in every book's `.orbis` copy, and a copy can arrive from another
  device at any time. `treatment` is checked against the real list rather than cast — unchecked, `fill` would
  reach the draw path as a line kind that does not exist.
- **Both channels show the same swatches**, from one list with no `palette` option to choose between them.
- **Black is not a swatch, because "Match the text color" makes it redundant where it works and misleading
  where it does not.** On a light or sepia page ink already resolves to near-black, so the two are
  indistinguishable; the one case where black is visibly its *own* choice is a dark page — where it draws
  an invisible line. A swatch whose only distinguishing scenario is the one it fails in should not be the
  first thing offered. The hex field still accepts `#000000`, so the capability is intact and merely
  unpromoted, and `colorEntry()` still names it — a mark left on black reads "Black", not "Custom".
- **`INK` is a sentinel, not a color** — a line set to it follows the page's own text color, resolved at
  draw time. It exists because black is the right ink on a light or sepia page and invisible on a dark one,
  and a mark is stored with the BOOK while the theme is per DEVICE: a color that is perfect where you set
  it can vanish where you read it. It is what a new line starts on, since a default that adapts beats one
  that is only right on the theme it was chosen under.
- **Ink is offered as a checkbox, not a swatch.** "Match the text color" sits *above* the line palette and
  grays it while it is on. A swatch would be a category error twice over: every other swatch answers "which
  color?" while this answers "should we pick one at all?", and a swatch has to paint itself in *something* —
  `currentColor`, the dialog's own text, which shows white in a dark theme and near-black in a light one. A
  swatch that displays one specific color while meaning "whatever the page's is" misleads rather than merely
  puzzles. The checkbox also keeps its label visible when it is off, which a swatch cannot: palette entries
  name themselves only once selected. Unticking restores the color ink displaced rather than resetting, so
  trying it costs nothing. None of this touches the data — the stored value is still the `INK` sentinel; the
  palette simply never receives it, and shows the color waiting behind it instead — the first wash color,
  which is visible on either theme.
  Elsewhere ink is its own value: previews render it as `currentColor` (in a preview the surrounding text *is*
  the page's text, so no resolution is needed); it carries its own badge glyph (✒️) so an ink mark and a
  black mark do not export identically (`COLOR_LOOKUP` matches every known color, displayed or not, so
  both keep their glyphs); and it is its own value for uniqueness — on a light page an ink and a black
  underline look alike, on a dark one they do not.
- **A disabled palette grays in place rather than disappearing.** The same flag covers the other case where
  the color is not yours to choose — a preset mark opened inside a book, before it has been copied in. The
  copy gate's hint says "the disabled fields below explain why", so the palette is disabled under it too.
- **`principalColor()`** is the one representative color for places that can only show one (the player's
  icon previews, the picker's current-chip ring): the wash if there is one, else the line.

`Treatment` values are named for what the reader sees, not for the foliate function behind them —
hence `box` rather than `outline`.

### Per book (`.orbis`, top level, alongside `highlights` / `notes` / `bookmarks`)

```typescript
{
  "preset": {
    "id": "ap_a1b2c3",         // which global preset this came from
    "name": "Reading marks",    // its name at copy time — display fallback, see below
    "revision": 4,              // the template revision this copy was taken at
    "marks": [ /* BookMark[] — the resolved copy, see "Per-mark tracking" */ ],
    "hiddenMarkIds": [],        // marks turned off in this book
    "noteMarkId": "…",          // role marks, overridable per book
    "audioMarkId": "…",
    "detached": true            // present only on a book that follows no preset
  }
}
```

Marks are copied **whole** — `id`, `name`, appearance, `badge`, `enabled` — which is what lets a
shared book export "Follow up" on a device that has never seen the preset. The preset's own `name` travels
too, for the same reason `Highlight.treatment` does: when the id does not resolve, the book can still say
what the set was called ("«Reading marks» — not in this vault") instead of only apologizing. The library's
name wins whenever the id *does* resolve, since that is the one the user can still rename. `createdAt` and
`isDefault` do not travel; they are library bookkeeping.

**Every book gets the default preset on open** (`ensureBookAnnotationPreset`). Eager rather than
on-first-annotation, and that is the point: every annotation carries a `markId` from the moment it is made, so
meaning is never something an annotation acquires later by color coincidence. It only writes when the key is
absent — which for a new book coincides with the `saveBookInfo` write already happening on first open — and runs
before the overlays exist, so the book's first draw already has its marks. An existing assignment always wins, so
a book assigned on another device keeps that preset even where this device's default differs. A book that has
chosen to follow no preset keeps that choice — see §"Detaching a book from its preset".

### On the annotation

`Highlight` and `Note` carry **two optional fields**:

```typescript
markId?: string;      // what it MEANS — resolves against the book's preset
treatment?: Treatment; // how it LOOKED when made — fallback beside `color`
```

`color` stays as it is. This is the most consequential decision in the design, so the reasoning in full:

| Approach | Recolor updates history? | Renders when unresolvable? |
|---|---|---|
| hex only | ✗ — hex *is* the identity | ✓ |
| `markId` only | ✓ | ✗ — no appearance to fall back to |
| **both** | ✓ | ✓ |

`markId` carries meaning; `color` and `treatment` are the render fallback, read **only** when `markId`
fails to resolve. The treatment is stored as well as the color because an annotation whose mark has been deleted
would otherwise keep its color but revert to a plain highlighter — losing its *shape* as well as its name, when
shape is what carries meaning for a reader who cannot rely on color. Both stored fields are creation-time
appearance and neither is consulted while the mark resolves, so retroactive recolor and re-treatment are
untouched.

**An unresolvable `markId` is not the same as no `markId`.** The first says "this meant something and the
definition is missing" — it is countable ("12 annotations reference a mark you deleted"), recoverable by
remapping, and still draws as authored. The second says "this never meant anything". They stay
distinguishable rather than collapsing into one state. Recolor "follow up" from green to teal and
every past follow-up follows, because meaning was never stored as appearance. Switch the book to a
different preset and the orphans still *draw* correctly in their original color, just without a name.

`markId` is optional, and that is not just for legacy data: **"no highlight" is a supported choice** for notes.
Unmarked is a valid, permanent state, not a migration artifact.

**Bookmarks have no color and get no mark.** Presets apply to highlights and notes only.

### `(color, treatment)` must be unique within a preset

Enforced at edit time. Two marks that render identically are indistinguishable to a reader — the
preset would be lying about what it can express. Uniqueness on the **pair** rather than on color
alone is what makes the treatment channel worth having: five colors × six treatments is a far higher
ceiling than five colors, and a reader who cannot distinguish the colors at all can build a preset
that differs only by treatment.

**Shown, not enforced after the fact.** The editor offers a taken choice as unavailable: a color another mark
already uses is struck through and disabled in the palette, a treatment that would collide is grayed in the list, and
the ink toggle goes the same way. A clickable choice answered with a notice would put the answer in the corner of the
screen, nowhere near the swatch, so the rule would feel like a click that silently did nothing. `presets.clash` is
kept for the two places a value does not come from something we drew: the hex field and the eyedropper.

The mark being edited is always excluded from the check, so its own current appearance is never struck out from under
it, and a disabled swatch leaves the tab order — the keyboard walks only what can be chosen.

The seeded built-in preset (§Migration) uses five unique colors, all washes, so `color → mark` remains a total
function *within that preset* — which is what lets existing annotations resolve by hex with no rewrite. In the
general case, an annotation with no `markId` resolves by color only if exactly one mark matches; otherwise it draws
in its stored color with no name.

### Names are unique too

The look is a mark's identity for finding annotations; the **name** is what it means, and the exports print the
name and badge, never the look. Two marks called Question — one a green wash, one a teal box — read as one in a
generated note ("❓ Question:") and as two identical rows in the mark bar. So a name is unique within a book or
preset as well (`isMarkNameFree`: trimmed, case ignored; an unnamed mark matches nothing).

- **The editor refuses a taken name** with `presets.name_taken` when the field is finished, and puts back the name
  last saved. A notice rather than a struck-out choice, because a name is typed, like the hex field.
- **A switch cannot hand the book two** — see §Switching presets, where the survivor rule gains a name pass.
- **A book mark holding a name blocks the preset's mark of that name**, as one holding a look does:
  `adoptFreedPresetMarks` leaves it out and `blockedPresetMarks` puts the `*` on the book's mark. The case: a switch
  keeps the old preset's Question because a passage uses it, while the new preset's Question is kept out by a look
  the book holds; freeing that look must not bring in a second Question. Renaming either mark lets it in, and so
  does deleting the book's: the delete dialog offers the preset marks it was holding out first
  (`marksFreedByDeleting`), and `deleteLocalMark` adopts them in the same write, so a passage moved onto one never
  points at a mark that is not there.
- **A preset update can still bring one in**: the book keeps a mark of its own called Question, and the preset
  later adds a Question in another look. The same gap as `mergeBookPreset`'s survivor rule for looks
  (§Detaching a book from its preset), and not closed.

### Mark order

**Array position in `marks[]` is the order.** There is no `order` field, and there must not be one.

This follows three existing Orbis structures — `NoteStyle.config.sectionOrder`, `lookupSections` and
`progressModes` — each an ordered array consumed by iteration
(`for (const sectionId of config.sectionOrder)`). An explicit `order: number` would have to be
renumbered on every insert and delete, can develop gaps and duplicates, and creates a bug class where
the field and the array position disagree about which is authoritative. For a short, hand-curated list
the array is simply better.

The cost is an invariant that lives in prose rather than in the type, so it is stated here once:
**anything that rebuilds `marks[]` must preserve position.** The places that will be tempted not to:

- the settings reorder UI (splice, don't sort)
- copying the preset into `.orbis` on assignment (copy the array, don't re-derive it from a map)
- the remap dialog, which reads the outgoing order and writes the incoming one
- the merge and any import, where two orders meet and one has to win

Order matters in exactly one user-visible place — which of the marks are the **first five** in the
picker — but that is a control the reader hits dozens of times per session, so a preset that silently
reshuffles is worse than one that cannot be reordered at all.

**Disabled marks are skipped, not counted.** The picker shows the first five *enabled* marks in order,
so disabling the third mark promotes the sixth into the row rather than leaving a gap. Concurrent
reordering on two devices is last-write-wins on the whole array, which is the same outcome an explicit
`order` field would give and needs no reconciliation logic.

---

## Treatments

Foliate already provides what this needs. `Overlayer.add(key, range, draw, options)` takes the **draw
function as a parameter**, and `overlayer.js` exports five as statics:

| Treatment | Source | Options honored |
|---|---|---|
| wash | `Overlayer.highlight` | `color`, `padding` (opacity/blend via CSS vars) |
| `underline` | `Overlayer.underline` | `color`, `width`, `padding`, `writingMode` |
| `strikethrough` | `Overlayer.strikethrough` | `color`, `width`, `writingMode` |
| `squiggle` | `Overlayer.squiggly` | `color`, `width`, `padding`, `writingMode` |
| `box` | `Overlayer.outline` | `color`, `width`, `padding`, `radius` |

Orbis's own abstraction passes the function through — `AnnotationController`'s
`draw: (fn: DrawFn, opts: unknown) => void`, called as `d.draw(Overlayer.highlight, { color })`.
Treatment-per-mark is therefore **a lookup at that one call site**, not new rendering machinery.
`reader/mark-draw.ts` is the only place that knows a treatment's *appearance*, while `annotation-presets.ts` stays
the only place that knows what one *means*.

**`double-underline` is ours.** Foliate has none, but the draw contract is only
`(rects, options) => SVGGElement`, so a custom function can be passed like any other — modeled on
`Overlayer.underline`, emitting two rects per line fragment at different offsets. No fork, no patch. Every
treatment the manager offers draws as offered: one that silently drew as a single underline would be the UI lying
about what the preset can express.

**Stroke widths are lighter than foliate's defaults** (1.5–2 rather than 2, and 1.5 rather than 3 for
`outline`). Foliate's defaults suit its default solid red; a Material 200/300 color strokes at full
opacity, where the same width shouts.

### Rendering caveats, all verified against `overlayer.js`

- **Contrast validation must be treatment-aware.** The wash renders at
  `var(--overlayer-highlight-opacity, .3)` with a blend mode; every other treatment strokes at **full
  opacity**. A color that reads as a gentle wash is loud as a solid 2px underline, and a pale color
  that works as a wash may be invisible as a line. One threshold cannot serve both.
- **`box` outlines each line separately.** A three-line selection draws three stacked boxes, not one
  enclosing outline. Acceptable for short phrases, visually noisy for long ones — worth saying in the UI,
  or restricting.
- **`getClientRects()` is not one rect per line, and that matters for closed shapes.** It returns one per
  layout *run*, and WebKit splits runs where Chromium does not, at boundaries invisible in the text (such as
  just after punctuation and a space). A box per rect would draw those seams as vertical rules through the
  middle of a line. `mergeLineRects()` unions rects that overlap vertically by more than half the shorter
  one, so a line is one box on every engine. Grouping by overlap rather than by an exact `top` is
  deliberate — a line holding a larger glyph reports slightly different heights for the same line — and
  the threshold is what keeps consecutive lines from merging into one box over the paragraph. Open
  treatments (`underline`, `squiggle`, `strikethrough`) are unaffected: fragments abut along the baseline
  and read as one continuous rule, which is why merging is applied in `boxOutline` rather than globally.
- **`box` must also draw INSIDE the text rect, the second reason Orbis has its own.** `Overlayer.outline` uses
  `x = left - padding` with the stroke centered on that edge, ~1.75px left of the text. With Appearance
  margins at 0 the text rect starts at `x = 0`, so that edge is off-canvas — and the overlay `<svg>` is
  `width: 100%` with the default `overflow: hidden`, which simply cuts it off. Justified text makes the right
  edge the same story on every line but the last. `boxOutline` insets by half the stroke instead of clamping to
  a viewport: in paginated mode the columns share one wide document, so a rect in the second column
  legitimately sits beyond the visible width and there is nothing safe to clamp to. Vertical padding is
  kept — a line box is taller than its glyphs.
- **`squiggle` draws below the baseline** at an amplitude of `strokeWidth * 1.5`
  (`M${left} ${bottom + strokeWidth / 2 + padding}`). With tight line-height, or a large Appearance
  font size on mobile, it can collide with the next line's descenders.
- **`strikethrough` carries pre-existing meaning.** Struck-through prose reads as "deleted" or
  "wrong" regardless of the mark attached. Fine as a deliberate choice ("cut this", "factually
  wrong"); a poor default.
- **Treatment diversity reduces collision with the reading highlight.** The listening highlight uses
  `Overlayer.highlight` on its own `READING_KEY`; a preset built from underlines never competes with
  it visually.

---

## Surfaces

### 1. The annotation picker — the mark bar

The bar offers **marks**, and a chip shows the mark's color *and* its treatment together, because a color dot
does not say enough: two marks can share a color and differ only by shape, and a reader who cannot tell the
colors apart is relying on the shape entirely.

**The chip is a two-letter sample wearing the treatment** (`createMarkSwatch`), reusing the manager's
`.orbis-mark-preview` classes on purpose — the thing you pick should look like the thing you configured. A
square box, not the round color dot: an underline or a strikethrough needs a baseline to sit on and a circle
crops both. The mark's **name** is the chip's accessible name and its desktop tooltip.

**Two cut-offs, not one.** A phone fits three 44px chips beside copy/note/lookup; anything wider fits five
(`Platform.isPhone`). A single lowest-common-denominator number would waste the desktop bar, and this is a
control the reader hits dozens of times a session.

**`…` opens the full list** — every enabled mark in preset order, each row a sample plus its name and
treatment, so the marks that did not fit are chosen by *meaning* rather than by remembering which color
meant what. It is **always** on the bar, even when every mark already fits, because the list has a second job:
**Manage marks…** is its last row, and the reader most likely to want the manager is the one who has not built
any marks yet — the built-in preset has exactly five. The label is "All marks", which is true at any count.

Details that are load-bearing rather than decorative:

- **`quickMarks()` decides which marks are quick** (enabled only, preset order, first N); the bar only
  renders them. Disabling the third mark promotes the sixth rather than leaving a gap.
- **The bar is rebuilt on every show**, not once per document — the manager is reachable *from the reader*,
  and its whole point is editing marks for the book in front of you.
- **Its arrow-key handler is attached once**, and reads the buttons at event time. `empty()` clears children
  but not the host's own listeners, so attaching per render would stack one handler per show, each holding a
  stale chip list.
- **A book with no preset falls back to the legacy five as unnamed fills.** Auto-assignment on open should
  make that unreachable, but a bar with nothing on it would mean no highlighting at all, which is a worse
  failure than an unnamed chip.
- **`markId` arrives from the picker**, not by resolving the chosen hex.
- **The note editor's color row is a mark row**, with `×` (no highlight) still first: an unmarked note
  is a permanent supported state, not an omission.
- **Converting a highlight into a note carries its mark**, not just its color, so the meaning survives the
  conversion.

### 1b. Role marks — what a note gets, what listening highlights with

Two jobs a mark can hold **per book**, stored as pointers on the preset and its book copy:

```typescript
noteMarkId?: string;   // what a NEW NOTE starts with. Absent = none.
audioMarkId?: string;  // what the listening Highlight button applies. Absent = first enabled mark.
```

There are no global color settings for these: a color setting could only ever produce an annotation with no mark
when that color was shared by two marks — the same ambiguity that strands un-marked annotations — so the roles
close the paths that could mint one.

- **Pointers, not per-mark flags.** One field, one holder, so "exactly one mark has this job" is structural
  rather than an invariant to police. `isDefault` on presets is the counter-example: a flag, and it needs
  "claim it only when nothing else does" logic at every write.
- **Notes default to none**, because an unmarked note is a supported permanent state and defaulting to a mark
  would put color on the page for every note whether the reader meant one or not.
- **Read-aloud defaults to the first enabled mark**, resolved at use time. "Position one" stored as an index
  would go stale on reorder, and stored as an id would stop being position one. Pinning happens the moment
  the reader chooses explicitly, after which reordering no longer moves it.
- **A pointer at a deleted OR disabled mark reads as unset** — retiring a mark must not leave a role aimed at
  something the picker no longer offers.
- The manager shows a **pencil / headphones glyph** beside the holding mark's name — the *effective* holder,
  including the read-aloud fallback, since showing the glyph on the mark that will actually be used is the
  honest thing. The **toggles are in the mark editor**: two more buttons per row would be sixteen extra thumb
  targets across eight marks, and the editor is where per-mark properties already live. The toggles repeat
  the same two glyphs (decorative, `aria-hidden`), so setting a role and recognizing it later are one
  visual fact.
- **The player's Highlight button is "Mark the passage".** What the wording has to survive: *"Listening
  highlights"* reads as a digest, the way "match highlights" does; anything shaped *"<x> mark"* reads as a KIND
  of mark, since `mark` is already a noun in this feature; *"Audio mark"* would sit beside the player's audio
  **Bookmark** button meaning something quite different; and a description without **"One tap"** reads as a
  running process that marks everything you hear. The result is a plain title and two rows of the same shape —
  label says *what*, hint says *when*:

  ```text
  Use for
    ☐ ✏️  Notes              New notes get this mark by default.
    ☐ 🎧  Mark the passage   One tap in the player marks the passage you're hearing.
  ```

  "Use for" rather than "Use this mark for" because every candidate label stuttered against a heading
  containing *mark*; a plain title also stops constraining the labels to nouns.
- The player's highlighter-nib and pencil icons preview the two role marks' colors, so full-screen listening
  shows which mark each button will apply. A role with no mark previews muted rather than in a color the
  button will not use.
- The built-in preset is locked, so roles can't be *changed* on the template — but they are *seeded* on it, both
  pointing at Key point (§Migration). Left unset, the preset every vault starts with would have no default mark
  for a new note, and its listening mark would be decided by the "first enabled" fallback: a claim about position
  rather than a choice, while the glyph in the list said a choice had been made. Every book can still override
  them in its own copy. A role pointer is part of what a book copies, so a shared id has to imply shared roles
  too — and `duplicatePreset` maps them onto the copies of the marks that held them, since duplicating is the way
  past the lock and a copy that lost them would lose a decision with nothing on screen to say so.

### 1c. One icon, everywhere it can be reached

`annotationsSvg(size)` launches the manager from the **reader toolbar**, the **foot of the `…` mark list**,
and the **full-screen listening view**, and appears again in the **dialog's own title** — the repetition is
what makes it learnable: the thing you tapped and the thing that opened wear the same mark. Sized by the
caller (14px on the toolbar, 20px on the player's actions) rather than fixed.

The glyph is a frame around **two differently-marked lines**, a wash and an underline: it says "several
*kinds* of mark", which is what a preset is. Two stacked cards would say "several documents"; a single marked
phrase reads well at 14px but loses the plural.

Hand-drawn rather than a Lucide name, because each candidate collides with something:

- `tags` — Obsidian tags are a first-class vault concept, and note export may one day emit real ones, so the
  glyph would be actively misleading rather than merely vague.
- `highlighter` — the player's Highlight button *is* a highlighter nib, and this glyph appears in that same
  view.
- `pencil` / `palette` — already the note-icons toggle and the display-style button on this toolbar.
- anything built from bare horizontal lines — at 14px that is the hamburger the contents button owns.

Judge a candidate by rendering it at 14px in a mock toolbar beside the icons it has to stay distinct from; at
that size the difference between a good idea and a legible one is most of the decision.

Deliberately **not** on the selection bar. That bar is a do-this-now bar with a hard width budget — on a phone
it is already copy · note · three chips · `…` · copy-link · look-up — and a manage button there would compete
with the chips it exists to support. The foot of the `…` list is context-adjacent at zero bar width, and it is
where "none of these marks are right" leads anyway. The always-visible toolbar icon covers discoverability
better than a bar button could, because it is there before anything is selected.

From the reader, the list or the player it opens on **This book**; from Settings and the palette, on the
shared library. There is no gear on the player: it would duplicate controls that have a canonical home, and
hiding them inside the voice dialog would be worse.

### 2. Tapping an existing annotation

The picker opens on tapping an annotated range and tracks an `annotated` state. The mark name is one more text
line in a popup that is opening regardless — the cheap 80% of "show the meaning in the book".

**Deferred: persistent in-book mark names.** Annotations are SVG rects drawn by foliate's `Overlayer`
inside the book iframe, and `Overlayer.add()` returns no handle on them, so a name has to be a
separately positioned element tracking the rect across resize, re-render and page turns — the same
class of problem as `NoteIcons.refresh`, already a complexity hotspot. **Desktop hover tooltips** hit
the same wall and need a spike before being promised.

### 3. Saved pane and search

Both are mark-first. Search filters by mark through `mark-filter.ts`, shared with the export dialogs, rather than
by hex, and the Saved pane shows each annotation's mark. Any filter over annotations is by mark, never by color.

### 4. Note export — badges, names and the line template

Markdown has no color, so **the mark's badge and name are the only things that survive** — this is why
`AnnotationMark.badge` exists.

`markPrefix()` in `export-format.ts` produces `🟡➖ Follow up: ` — badge, name, colon — and is the single place
the notes export's highlights and notes, the per-chapter files, and the clipboard builder share. `NotesData` has
`marks`, fed from the BOOK's copy rather than the library preset: an annotation's `markId` can name a mark this
book owns and no preset has, and resolving against the library would silently drop the badge and name of every
local mark.

A color-only glyph is not enough: the wash palette has more colors than there are distinct color emoji, and a
mark is not a color — two can share one and differ by treatment, which a color-only glyph flattens exactly where
it travels furthest. `emojiForColor()` covers the palette plus hue-bucketing, and is the fallback for an
annotation with no `markId` — one made before marks existed, or whose mark the survivor rule dropped.

An unnamed mark contributes its badge alone: the colon only appears when there is a name to separate. The
prefix carries its own trailing space, so an annotation with neither mark nor color leaves no double space.

**The line template.** `highlightLineTemplate` and `noteLineTemplate` on `NoteStyle.config`, beside
`frontmatterTemplate` / `folderNameTemplate` / `chapterFileTemplate` and using the same `{{token}}`
substitution where an unknown or absent token resolves to **empty**. Defaults:

```text
- {{mark}}"{{selection}}" — {{link}}                 highlights
{{selection_block}}{{mark}}{{note_text}} — {{link}}  notes
- {{link}}                                           bookmarks
```

**One thing is called one thing wherever it appears.** `{{selection}}` is the book's words — the passage you
highlighted, or the passage a note hangs on, which are the same thing seen from either side — so both
templates use that name. Alongside it: `{{mark}}` (the composed `badge name: ` prefix), `{{mark_badge}}` and
`{{mark_name}}` for a different arrangement, `{{link}}`, `{{loc}}`, and `{{selection_block}}`.

The mark's three tokens are **prefixed so they read as a family**. Bare `{{badge}}` and `{{name}}` would give no
hint they belong to the mark — `{{name}}` in particular could as easily mean the book's or the chapter's.

Each field gets chips saying which placeholders it accepts and, under them, its **own** "Placeholder details"
fold — generated from the same array as the chips, so a template can never offer a token its details omit. A
chip can show a name and nothing else, and no name conveys that `{{mark}}` is a badge, a name, a colon *and a
trailing space*. Per-block rather than one shared list, so the reader does not have to read past `{{kind}}` and
`{{note_text}}` to find the two that apply to the field in front of them.

Each fold closes with the rule that makes the mechanism safe and doubles as the off switch: leave a
placeholder out and that part does not appear; misspell one and it resolves to nothing rather than breaking
the file.

`{{selection_block}}` is that passage as a `> "…"` block. A different *shape* is a different thing, so it gets
its own name rather than one token resolving to raw text on one template and a quoted block on the other. It
exists at all because a single-line template cannot say "this line only when the value exists", and a note
without a passage must leave no stray `> ""`. Both tokens are offered on both templates; on a highlight the
block is simply never empty.

Notes add `{{note_text}}` — what the reader typed, as opposed to what the book says. **There is no
`{{text}}`:** it would mean the book's words on one template and the reader's on the other, which is the sort of
trap a template exists to remove.

All three share `{{link}}`, `{{loc}}`, `{{chapter}}` and `{{date}}` (ISO, matching the frontmatter template's
`{{today}}` rather than inventing a second date format). **Bookmarks** have no mark and no text, so those four
plus `{{kind}}` — `reading` or `audio`, whether it was made while reading or while listening, and the one
thing about a bookmark nothing else in an export can tell you. Its default is the link alone: a bookmark has
nothing of its own to say, so the link is the line.

No `{{label}}` for bookmarks, deliberately. `Bookmark.label` looks like a name but is a breadcrumb derived at
creation time (`CHAPTER IX. · loc. 51`), so it says nothing `{{chapter}}` and `{{loc}}` do not — and being
frozen when written, it can be staler than they are. Bookmarks cannot be named, so nothing is lost by leaving
it out.

Two templates rather than one, because a note has a quoted passage and a highlight does not. `{{selection}}`
resolves to the **whole block** including its quoting, or to empty: a single-line template cannot express
"this line only when the value exists", and a note without a selection must not export a stray `> ""`.

Empty-token resolution is what makes the field safe to edit — a typo loses a value, it never breaks the file —
and it is also the off switch. **There is no "show marks" checkbox**: removing `{{mark}}` is how a style stops
exporting marks, and a token that sometimes silently resolves to nothing because of a checkbox elsewhere is
not a template anyone can reason about. The cost is that there is no per-run checkbox in the Generate Notes
dialog.

It also hands over a format decision that is not ours to make. Dialogue would export as `""He said," she said"`
if the format wrapped every excerpt in quotes while the book's own text already opened with one — with a
template, you delete the quotes from it.

The clipboard builder takes the templates too, defaulting to `DEFAULT_NOTE_STYLE_CONFIG`: a clipboard copy
has no note style of its own, and matching the default export beats a second hard-coded format.

**No grouping by mark.** Grouping, sorting and filtering exported annotations belongs to **Obsidian Bases**,
over one note per annotation — see `notes-export.md` §Per-annotation records for the schema and the reasoning.

Two things decide it. Every reasonable regrouping request ("by mark then chapter", "only this mark", "the last
month") would be ours to write and maintain; Bases does all of it in YAML the reader owns. And a document has to
place annotations that have **no mark** — bookmarks never do, and a note without a highlight has none by design —
which needs an invented "Unmarked" heading and a ruling on whether bookmarks belong under it. In a database view an
empty property is just an empty group.

The mark's contribution to an export is therefore its badge and name on the line, plus the `mark` and
`mark_badge` properties on a record. Nothing groups by mark in our code.

#### Badges

`badge` is **not an emoji field**, despite defaulting to one. It is a few characters that stand in
for the mark wherever color cannot be shown — principally exported Markdown. `#1`, `URG`, `Q` and `!!`
are as valid as a glyph, and capped at `BADGE_MAX` (12 UTF-16 units) so it stays a badge rather
than becoming a second name.

The default is `defaultBadge(color, treatment)`: the color's emoji plus a **treatment suffix**
(`➖` underline, `➖➖` double, `〰️` squiggle, `✖️` strikethrough, `🔲` box; a wash alone bare). The suffix
exists because `(color, treatment)` is unique, so two marks may share a color — and a color-only glyph
would export both identically, losing the distinction precisely where it travels furthest. Emoji offer
only two color families (circles and squares), nowhere near six, so the treatment rides along as a
separate glyph. All suffixes are Unicode 6.0 or older; a newer glyph like 🟰 renders as tofu on older
Android.

A wash alone stays bare so the five legacy colors keep exporting as the exact single glyphs they always have
— those emoji are already sitting in previously-exported notes.

**Absent means "derive it".** Nothing ever stores the derived value, so a mark's badge keeps
tracking its color and treatment until the user types their own; clearing the field, or typing the
default back, resumes tracking. Recoloring re-derives only when the user never set one.

### 5. The manager — `AnnotationPresetsModal`

A **dialog**, not an inline settings block. Same reasoning as `PronunciationsModal`, whose own header
states it: the list grows without bound and would dominate its tab. Plus one the glossary does not have —
a reader adjusts the preset for the book they have open, and a dialog can be opened from a reader while a
settings section cannot. Settings keeps a row that opens it (see §"The manager's door moves onto the reading
page"), and there is a palette command.

**The mark editor has two tabs — General | Appearance.** Name, badge and the role toggles on one; the two
color channels and the sample on the other, because the pair would not fit above a phone keyboard alongside the
rest. "General" rather than a precise name because that tab is a grab-bag — name, badge AND the role toggles —
so anything precise would over-promise and then not cover the roles; "Appearance" is exact, and is what the code
already calls it (`MarkAppearance`). The tab survives re-renders, since every edit commits and redraws and it
would otherwise bounce back to the first tab on every color pick.

**One layout on every device: a read-only list, editing behind a per-mark dialog.**

```
⋮⋮   Green                     (Preset)     [x] Active   ✎  ↑  ↓  ✕
     Sample                        🟢
```

Row: drag handle (fine pointer only), the identity block, Active, reorder, delete. Tapping the identity block opens
the editor. On touch the row becomes two columns — identity left, controls right — pairing each control with what it
acts on (Active beside the name, reorder/delete beside the visual).

**The identity block is two lines and two columns, the same everywhere**: name then tag on the first, sample then
badge on the second, with the second column LEFT-aligned so the first glyph of every badge is at one x. Three
arrangements are ruled out:

- **Five columns across one line.** The name gets whatever the sample, the badge, Active and five buttons do not
  want — about nine characters in a dialog this wide — and every provenance tag sits at a different x, since each
  row measures its own cells.
- **A wrapping flex line.** Where the sample lands depends on how wide that row's badge is, so no two rows agree.
- **A treatment line under the name** ("Double underline"). The sample two columns over says the same thing, and
  the words cost the name most of its width. What they are *for* is the reader who cannot see the sample, so the
  appearance is in the row's accessible name (`presets.edit_mark_appearance`) instead.

**The list owns the columns and the rows borrow them** — `.orbis-mark-list` is the grid
(`name/sample | tag/badge | slack | Active | controls`) and each row is `grid-template-columns: subgrid`. `subgrid`
rather than `display: contents`, so the row stays a real element and keeps its hover background, its drag feedback and
its `is-off` fade. **Anything content-sized is a per-row measurement, and per-row measurements cannot line up** — which
is the whole reason the list holds the tracks: the first two are `max-content` bounded, so each is as wide as the
longest name and the longest badge *in the list*, and every row agrees.

Right-aligning that second column is wrong twice over: it lines up an edge nobody reads while the glyph everybody
reads — the leading one — lands somewhere new on each row, and it pushes the column against the controls with a lake
of empty space in the middle. Left-aligned, with the slack after it, the two columns pack toward the middle and read
as a small table. The badge is capped and ellipsized for the same reason the name is: twelve ASCII characters is a
legal badge and is not a badge.

**On touch the row is three lines, and the controls have one to themselves.** Four 40px buttons, the drag handle and
the Active label come to about 210px of a 380px dialog; sharing a line with them would leave the identity block too
narrow to show a name. So the block spans the full width in the same shape it has on a desktop, and
`[x] Active … ✎ ↑ ↓ ✕ ≡` sits beneath it. A phone can spare a line far more easily than it can spare 100px of width.

The list also stops handing out tracks there (a row is its own grid), so the block's tag/badge column is a fixed
`5.5em` rather than content-sized: a content-sized track is a per-row measurement, and per-row measurements make the
badges ragged.

**Add mark opens the editor on the new mark's name**, rather than appending an unnamed row and stopping. The mark is
created and saved on the click; the dialog that is always the next step opens itself. Add sits above the list and the
new mark appends below it, so on a long preset the thing you just made would otherwise be off screen.

There is no inline editing table, and the reasoning is worth keeping:

- **The row already shows every field a table would.** A table would buy editing *ergonomics*, not visibility.
- **A table needs a header grid structurally identical to every row grid.** CSS cannot enforce that, and it breaks
  in ways that each present as a different bug: an `em` template resolving against the header's smaller font, a
  `max-content` track sizing to an empty header cell, a `display: none` child removing a track from the rows but not
  the header.
- **The keyboard settles it.** A list of text inputs must fit the ~40% of a phone screen a keyboard
  leaves; a list of text *labels* raises no keyboard and can use the full height. Only the four-control
  editor pays the cost.

Details that device testing decides:

- **The sample renders on the live reading surface** — `readCurrentDisplaySettings` +
  `resolveHostBgDimmed` + `resolveHostFg` — so a wash is judged against the actual page, not Obsidian's
  chrome. In the editor it sits inside a line of prose, because "can I still read this?" is the question
  and one word cannot answer it. Two honest approximations: the reader applies brightness as a filter
  over the whole iframe, so a dimmed background *color* is close but not the identical pixel; and font
  *size* is deliberately left alone, since the book's size would make rows lurch.
- **CSS approximates the treatments** — `color-mix` for the wash, `border-bottom`, `border-bottom: double`,
  `text-decoration: underline wavy`, `line-through`, a bordered box. The real thing is foliate SVG inside
  the book iframe and cannot be reused here, so this is a faithful approximation on a different code path.
- **The badge has its own left-aligned cell**, not a place in the text. Inside the text it could not both
  line up across rows and sit near the treatment: trailing it puts a one-glyph and a three-glyph badge at
  different x, and pushing it to the block's far edge aligns the right-hand side while opening a gap.
- **Curated palette, plus custom.** `<input type="color">` invites picking two near-identical colors,
  which defeats the distinguishability the design rests on. A hex field and an eyedropper sit behind the
  grid. The label names the color it *has* — "Custom" only when the color genuinely is not a palette
  entry — and a custom color is appended to the grid as a selected swatch so the selection is always
  visible somewhere.
- **The color panel expands inline**, never as a `createOrbisPopup`: that attaches to
  `activeDocument.body`, outside a Modal's DOM, where focus containment makes the hex field untypeable.
- **A divider after the fifth enabled mark**, marking where the reader's quick row ends.
- **Drag *and* arrows.** Drag is pointer-only — HTML5 drag-and-drop has no touch implementation, so the
  handle is hidden under `(hover: none) and (pointer: coarse)` and the arrows are the touch and keyboard
  path. Only the handle carries `draggable`: a draggable row makes its own `<input>` children
  drag-initiators, so click-dragging to select text would start a row move.
- **One editor at a time**, so a double tap cannot open two dialogs for one mark, both able to save.
- **Deleting a preset is confirmed**, naming it and counting its marks. Deleting a single *mark* is confirmed
  too: annotations reference `markId`, and a recreated mark gets a **new** id, so rebuilding the row identically
  does not re-adopt the annotations that pointed at the old one. Both prompts share `confirmDestructive()`, and
  both second lines say what *survives* rather than what is lost.
- **Mobile keyboard handling lives in `pinModalAboveKeyboard`**, shared with both glossary dialogs; the rules
  are in [Dialog System](dialog-system.md#pinmodalabovekeyboard--the-general-modal-side-fix).

**Contrast validation** is answered by the reading-surface sample, which lets the user see whether a mark works on
their own page. An algorithmic check, if one is added, must be **treatment-aware** — the wash renders at ~30%
opacity while every other treatment strokes at full, so one threshold cannot serve both — and `resolveHostBg` in
`settings.ts` is the precedent. The curated palette pre-solves most of it.

---

## Lifecycle

### Two scopes: the preset, and this book's copy

The manager has **two tabs — This book | Presets** — because it edits two different objects with different
consequences, and a book can draw differently from the preset the list shows when the preset was edited on another
device. **This book** is the leftmost and primary tab: the reader thinks in terms of the book in front of them, and
it is the workspace — add local marks, hide preset marks, copy definitions in, reorder. **Presets** (plural — it is
the library) is the secondary one. Tab *order* and *default* are independent, so Settings and the palette open on
the library.

A book routinely carries marks this device's library has not yet seen — a book shared from another vault, or one
annotated before the library synced — and it renders correctly regardless, because its copy is authoritative.

**Presets tab** — the shared library: pick, rename, delete, duplicate, add, edit marks. Which preset a book uses is
a fact about the book, so it is not set here.

**This book tab** — that book's own marks, plus the actions on the book's relationship to its preset: **Change
preset…** (§Switching presets), **Stop using this preset** / **Use a preset…** (§Detaching), and **Save as new
preset** (§Save as new preset). A book with no preset has **no marks in its file to edit**, so the empty state
offers `Start from "<default>"` rather than directing the reader to the other tab — the click is the explanation.

Decisions worth keeping:

- **A mark id lives in at most one library preset.** This is the invariant behind both `duplicatePreset`
  (fresh ids always) and `promoteBookToPreset` (fresh ids only where the library already owns one) — see
  §Save as new preset.
- **The open book re-merges on a library edit** to the preset it tracks, so the book on screen updates as you
  tune a mark.
- **The manager finds the book even when the book isn't the active leaf.** It is usually reached from
  Settings or the palette, so `activeBookForPresets()` falls back to the *only* open reader view. Two open
  books with neither active shows no book controls rather than guessing.
- **An assigned id with no matching preset is normal**, not corruption — a shared book, or one whose
  template was deleted here. Both tabs say so ("A preset this vault no longer has") and the book keeps
  working from its own copy.
- **Nothing holds a mark or preset OBJECT across a save.** `MarkTarget` resolves `marks` through a getter
  and the mark editor takes a `markId`, because `onExternalSettingsChange` replaces the whole settings graph
  — a captured reference then becomes an orphan that accepts mutations and loses them at the next save,
  silently. The same abstraction is what lets one list, one row and one editor serve both scopes.

### Rendering an assigned book

Where the mark actually reaches the page, all of it in `AnnotationController`:

- **Both draw sites resolve the stored record, not the event.** `draw-annotation` carries only
  `{ value, color }`, so `tryDrawNote` / `drawDefaultHighlight` look the `Highlight` / `Note` up by CFI to
  get its `markId`.
- **The mark's color wins over the stored hex when a mark resolves.** This is the payoff of storing both:
  recolor "Follow up" from green to teal and every past follow-up follows. An annotation whose `markId` no
  longer resolves keeps its stored color, so nothing ever fails to draw.
- **Whether a note draws is the appearance's decision (`marksAnything`), not one channel's sentinel.** A
  line-only mark stores `'transparent'` in its wash slot, so a guard on `'transparent'` would silently skip it.
  An unmarked note still reaches the overlay so its margin icon can be positioned.
- **Re-adding a note's annotation is unconditional**, for the same reason: redrawing only when the wash color
  changes would read a switch between two line-only marks (`'transparent'` on both sides) as "nothing to redraw".
- **Re-assign redraws by re-adding, not delete-then-add.** Foliate's `addAnnotation` calls
  `overlayer.remove(value)` before re-emitting `draw-annotation`, so one call is a redraw — and it clears
  the old drawing even when the new mark draws nothing.

### Per-mark tracking

How a book's copy relates to its preset rests on one question: *if a book uses Preset 1 and I add a mark to that
book, does a later edit to Preset 1 still reach the book?* It does. Two sentences govern the answer:

> **The preset owns what a mark *is*. The book owns how it's *used*.**
>
> **A mark survives a change only if annotations depend on it — unless you made it here.**

The first decides where every property lives: name, colors and treatment are the preset's; order,
visibility and the note / read-aloud roles are the book's. The second decides what happens whenever marks are
removed or replaced.

#### Data

```typescript
BookPreset {
  id, name,
  revision,                  // the template revision this copy was taken at — NEVER bumped in-book
  marks: BookMark[],         // order is the BOOK's, seeded at assign and never re-derived
  hiddenMarkIds?: string[],  // book-level visibility
  noteMarkId?, audioMarkId?, // book-level roles
  detached?: true            // follows no preset — see §Detaching
}
BookMark = AnnotationMark & { local?: true }
```

There is no book-level "customized" switch: whether a book has edits of its own is `marks.some(m => m.local)`,
because provenance is per mark.

There is only one kind of local mark. Copying a mark in mints a new id (see below), so a copy's id never
exists in the template and "added here" and "copied here" are the same data — the copy is a UI flow, not a state.
Tracked marks remain **full definitions** in the file; `local` is provenance, not a switch between copy and
reference, because a shared book must still render on a device that has never seen the preset.

#### The merge

`mergeBookPreset`:

| Mark in the book | Template | Result |
|---|---|---|
| tracked | still has it | definition replaced, position kept |
| tracked | dropped it | kept as **local** if annotations use it, else removed |
| **local** | — | never touched |
| — | has one the book lacks | inserted after the tracked mark it follows in the template |

Then `revision := template.revision`. Runs on book open, after a preset edit for the open book, and when a synced
preset arrives while its book is open. Books that aren't open merge when next opened. Tracked marks simply
update, with no prompt: they are read-only in the book, so there is nothing local to lose, and silent is what a
shared preset means.

**Forward only.** Run it when `template.revision > book.revision` and never otherwise. A device may hold the
preset at revision 3 while a book's copy came from another device at revision 7; without the guard, opening that
book would treat the older template as truth and quietly revert the marks. When the book is *ahead*, leave it
alone.

**Insertion position, not append.** Order decides the quick row, so a mark the preset author put second
would arrive buried below the fold in every existing book and stay invisible until the reader reordered.
Placing it after the tracked mark it follows upstream costs a few lines and respects both orders.

#### Copying a mark into the book

A tracked mark is **read-only in the book** until the reader presses **Copy to this book** — offered inside
the mark editor, with the fields disabled until then, so the button appears exactly where the intent forms.
Detaching on the first keystroke is ruled out: tweaking a color would silently stop that mark receiving updates
forever with nothing on screen saying so.

The copy (`copyMarkLocally`) **mints a new mark id**, and three things happen together:

1. a new local mark takes the preset mark's place in the book, with its position, its roles and whether it is
   active here, and records the preset mark's id in `copyOf`
2. this book's annotations are rewritten from the old id to the new one (`applyRemap`)
3. the preset's mark **leaves the book**

Minting rather than reusing the id is the same rule `duplicatePreset` and Save as new preset follow: **one
id, one definition, everywhere**. Reusing it would let a single id mean "green wash" in the library and "red
box" in one book, and everything downstream — cross-book search by mark, export by mark, receiving a shared
book — assumes an id names one thing. Annotations follow the mark you just edited because step 2 moves them.

**The copy replaces the original; it does not sit beside it.** An original left in the book, hidden, is still a
mark: the dialog lists it, its **Active** switch turns it back on beside the copy, and it holds the look the copy
may want to return to. `copyOf` is what lets it go. Every rule that asks whether the book lacks a preset mark —
the merge, `adoptFreedPresetMarks`, `blockedPresetMarks` — reads it through `heldMarkIds`, so a copy counts as
the book having that mark. If the preset **updates** it, the copy is the book's version and is left alone; if
the preset **deletes** it, there is nothing in the book to clean up. Without `copyOf` a copy still identical to
its original would lose to it under the silent-clash rule on the next preset update. Stopping a preset and
promoting to a new one drop `copyOf`, since neither leaves a preset for it to name.

Beyond that the copy has **no tie**: no revert, no "the preset now says…". Deleting the copy frees the look, and
the preset's mark comes back the ordinary way, through `adoptFreedPresetMarks`.

**The three writes are one write.** The copy touches the preset copy, the highlights and the notes; a failure
between separate writes would leave annotations pointing at a mark that does not exist yet, or at one that has
left the book. `saveBookPresetAndAnnotations` is the single combined write, shared by the copy, the
remap dialog, Save as new preset and deleting an in-use local mark.

#### Switching presets — one dialog, not a picker

Reached from a **Change preset…** button on the This book tab, never from an inline select. Three reasons,
in increasing order of importance: on Android a select is a spinner and a mis-scroll would silently re-point
the book; the action is rare and consequential, which is what buttons-with-ellipses are for; and the dialog
it opens **is the remap dialog** — so this is not extra surface bought for safety, it is the remap flow given
a front door.

The dialog picks the target, then maps what is in use:

- One row per **in-use** mark in the outgoing preset, with a count ("Follow up — 12 highlights")
- A target per row: any mark in the incoming preset, or **Keep in this book** (a local mark)
- **Atomic** — cancel changes nothing; there is no half-migrated state

**Two choices, not three.** There is no "leave unmarked" option. Its case — *"the color and treatment still
matter but the category doesn't"* — is thin, it would make the reader weigh three options where two suffice, and
it would be the only way to leave a **passage selection markless in a current file**, which is precisely the
state eager preset assignment exists to retire. Keeping a mark in the book costs one row in its list; the
alternative costs a permanent hole in the model. If a reader genuinely wants the category gone, they can delete
the local mark afterwards, which is one deliberate act rather than a choice forced on them mid-migration.

**Remap first, then the survivor rule** (`switchBookPreset`). Once mapping has rewritten those annotations,
whatever is left is genuinely unused and can be dropped silently. A book with no annotations skips the dialog
entirely.

Survivors on a switch follow the second governing sentence, with one carve-out: **inherited** marks survive
only if annotations depend on them, since the incoming preset supersedes them — but **local** marks survive
even unused. An unused local mark is not leftover inheritance; it is something the reader named,
colored and gave a treatment, and dropping it on a technicality destroys work.

**Except where the incoming preset has a mark of the same name** in another look (§Names are unique too). Then:

- **Unused**, the book's mark goes and anything pointing at it (a role, a hidden id) follows to the namesake through
  `idMap`, as a look collapse does. The meaning arrives with the preset; what is lost is one look nothing used.
- **Inherited and in use**, its passages move to the namesake without a row, as they would to an identical twin: the
  preset that defined the mark is replaced by one that defines it again, in another look, and nothing the reader
  made is being replaced. A row here was a dropdown with a foregone answer.
- **The book's own and in use**, its row defaults to the namesake (`presetSwitchNameTwins`) rather than to Keep in
  this book — the one row where the dialog makes the guess, because the preset calls a mark the same thing. The
  row's muted line says what the other choice costs: kept, the book's mark is renamed *Question (this book)*, and a
  typed badge that matches the namesake's goes back to the default its own look gives it.

A look clash is decided first, so a mark that wears an incoming look never reaches the name pass.

#### Turning a mark off in one book

`hiddenMarkIds` is book-level and separate from `enabled`, deliberately. If it were an edit to the mark
it would force a copy and fork the definition — far too heavy for "I don't use Follow up in this
novel". Kept separate, it survives template updates untouched and goes inert if the mark is later deleted
upstream.

**The reader is not shown that split.** Both tabs label the checkbox **Active**, and only the accessible name
names the scope ("Active in this book — *Blue*" against "Active — *Blue*"). A word like "Shown" would frame the
control as being about what is on the page — and nothing already marked changes when a mark goes off. Two
different words for one question, in tabs one click apart, is how somebody retires a mark everywhere while
meaning to retire it in one novel.

A mark that is off is **grayed in place** in the This book list rather than removed from it: hiding it elsewhere
would mean going to the Presets tab to find something you turned off here. It is offered **nowhere** in the
reader — not the quick row, not the `…` list, not as either role mark.

**`offeredMarks(book)` is the one answer to that**, and everything that offers a mark goes through it: the bar
(`barMarks`), the `…` list, and `noteMark`/`audioMark` via `offeredPreset()` in the controller. Filtering on
`enabled` alone is not enough, because it ignores `hiddenMarkIds`. Drawing deliberately does **not** go through
it: an annotation made with a mark that is now off keeps its appearance and its name.

A mark disabled in the *preset* does not appear in the book list at all. It is retired everywhere, so it is
not the book's to hide or copy; annotations already using it keep resolving.

#### The tabs

- Local marks carry a **"This book"** badge; tracked marks carry nothing. Badging the normal case is noise —
  the exception is what the eye should catch. No grouping into sections, which would fight the book's order.
- **Delete is local-only.** Deleting a tracked mark would just bring it back on the next merge, so tracked
  rows offer turning it off instead — the operation actually wanted, and one that survives updates. A delete
  that silently undoes itself is worse than no delete.
- **There is no bulk reset of a book's copy**, only per-mark actions. A bulk reset only exists to do damage in
  one click, on the tab the reader lives in.

#### Save as new preset

Promotes the book's whole vocabulary into a new library preset and leaves the book **tracking** it. One
invariant governs it, and the two kinds of mark fall out of that rather than being special cases:

> **A mark id lives in at most one library preset.**

- A mark whose id is **not** in any library preset — one of the book's own — **keeps** it. Nothing else can
  claim that id, and preserving it means the annotations carrying it need no rewriting at all.
- A mark whose id **is** already in a library preset — one the book tracks — is **re-minted**, and this
  book's annotations are re-pointed onto the new id. Keeping it would put one id in two presets, and a book
  later switching between them would find the id already resolving in the incoming preset, skip the mapping,
  and silently adopt the *other* preset's definition the moment the two diverge. Invisible at the moment of
  the mistake, which is the worst kind.

Fresh ids for *everything* would satisfy the same invariant but rewrite annotations that are never at risk; the
narrower rule is the one used.

Five things travel with it, every one of them id-shaped, and each silently breaks something if forgotten:

1. **Role pointers.** `noteMarkId` / `audioMarkId` hold mark ids and go through the same map, or the note and
   listening roles detach.
2. **`hiddenMarkIds`** goes through it too — and hidden marks are **included** in the preset. Building from the
   offered marks only would orphan any annotation using a hidden mark: hiding is a statement about the reader's
   mark bar, not about what the book depends on.
3. **`local` is cleared** on every mark. The point of the operation is that this book's vocabulary *is* the
   preset now, so nothing is exempt from its updates. Left set, a mark would be permanently exempt from
   updates to the preset it helped create.
4. **Not routed through the switch.** `changePreset` runs the survivor rule; a promotion has nothing to
   infer, so the copy is taken as given (`applyPromotion`) and the only work is following the id map.
5. **One atomic write** (`saveBookPresetAndAnnotations`), so a re-minted id can never be stored without the
   annotations that point at it. The library entry is written **first**: an unused preset is a harmless
   leftover, a book pointing at a preset that was never created is not.

Nothing visible changes — the marks are copies, so appearance, names and order are identical. The notice says
"This book now tracks it" rather than "saved", because the operation is not the read-only copy its label
suggests.

There is no helper that preserves every id unconditionally: it is correct only when a book has no tracked marks
at all, and a trap the rest of the time.

#### Book-is-newer

There is no prompt to push a book's marks up into its preset. Local marks are a permanent, intended state, so a
prompt would nag about something working as designed, and with the library synced a book cannot be ahead of it
for long. **Save as new preset** is the deliberate way to promote local work.

#### Reading older copies

A copy written with the legacy book-level `customized` flag has no per-mark provenance, so for a customized book
there is no way to know which marks were edited. `readBookPreset` reads `customized: true` as **all marks
local**: nothing is lost, the book simply stops tracking, and deleting a mark re-inherits it. `customized: false`
reads as all tracked, which is exactly true. The flag is never written.

### Importing an unknown preset

A book can reference a preset id this device's library doesn't have — a book shared from another vault, or one
whose preset was deleted here.

**Always imported, automatically, with no prompt**, because **the missing library entry is not a cosmetic
problem, it is what makes the book's copy unmergeable.** With no template there is nothing to merge against, so
the book's marks and the preset elsewhere would drift apart with no common ancestor and no way to notice. That
also disposes of the branch a prompt implies: "import" and "turn its marks into local marks" are not two
choices; the second is a way to corrupt the relationship. There is one behavior.

`presetFromBookCopy()` reconstructs the entry from what the book carries — id, name, **the copy's own
revision** (not 1, or the next open would "merge" the book forward onto what is really itself), and its
tracked marks. Two exclusions: **local marks**, which are the book's own additions and whose only sanctioned
route into the library is §Save as new preset; and `hiddenMarkIds`, which is book-scoped usage. It returns
null for an all-local copy — a legacy `customized` book — where there is no information about what the preset
was, an empty preset would be worse than none, and every mark being the book's own already makes it editable.
A detached book is never imported from (§Detaching).

An import **arrives inactive** (§Inactive presets), and a **notice** says so (`presets.imported`), not a prompt:
nothing to decide, but it does add an entry to a list the reader will later see.

### Hidden presets

A preset the reader does not assign by hand can be kept out of the way: that is the `inactive` flag, described
with the synced library in §Inactive presets. It is deliberately **display only**:

- Filtered out of the lists that offer a preset to **assign** — Change preset's options and the book
  empty-state. `visiblePresets()` is the single place that decides.
- **Not** filtered out of the manager's own selector, which chooses what to EDIT. A preset you cannot select
  is one you cannot reactivate, and "keep it out of my way when assigning" says nothing about editing it. That is
  also why there is no reveal toggle: nothing needs revealing. Inactive entries carry an `Inactive` badge there.
- **Nothing else.** Resolution, merging, rendering and the book's own copy are untouched. A book using an
  inactive preset is in no way degraded.

That last point is the whole design. A flag that *disabled* a preset would recreate "this book uses something
that doesn't work here" — the exact state the import exists to remove. Being inactive is about a list; it can
never produce a state anyone has to reason about.

| Control | Where | Governs |
|---|---|---|
| **Deactivate** / **Activate** | manager, beside Set as default | This preset. A two-state command, not a checkbox: everything else on those rows is a verb you press, and a lone checkbox at the head of a long list reads as though it might apply to the list. Unlike Set as default it is reversible, so the reverse needs saying rather than a badge. The built-in is exempt — it is the fallback default |

### Deleting a preset

Delete does not mean gone: a book that uses it re-imports it on its next open. So the confirm says so —
`presets.delete_returns`, the last line of its body. There is no third button: **Deactivate** sits directly
under **Delete** on the same row, so a button in the dialog would be the same command twice, a click apart.

A warning rather than a **block**, deliberately. Blocking delete for a preset "in use" needs a scan of every
`.orbis` in the vault, and the answer is provisional in both directions — a book never opened has no file
yet, one added next week may carry it, and a stale file for a removed book would report use that no longer
exists. A hard block on a soft fact fails badly: the false positive leaves a preset undeletable forever. The
generic warning needs no I/O and is true either way.

Hiding is the only suppression the unknown-preset path needs; a remembered "declined" record competing with it
would be two ways to express one wish.

---

## Deleting a mark that is in use

**The question.** Deleting a mark leaves its annotations pointing at an id nothing defines. They keep their
appearance and lose their meaning — the state this design elsewhere exists to retire; see §Switching presets,
where there is no "leave unmarked" because it would be the only way to leave a passage selection markless in a
current file.

### What the survivor rule already handles

**A preset mark deleted upstream is not an orphan.** `mergeBookPreset`'s survivor rule catches it at the next
open:

```ts
// Dropped upstream: it becomes the book's own if anything still points at it.
else if (isInUse(m.id)) marks.push({ ...m, local: true });
```

Every book that was using the mark keeps it, badged **This book** — name, appearance and filterability intact
— and books that were not using it drop it silently. Nothing dangles, nothing prompts, and no cross-book
coordination is needed, because the decision is taken per book at the only moment that book is in hand.

A tombstone scheme — record the deletion and the chosen remap on the preset, then prompt each book that opens
afterwards — is **not needed for preset marks**, and would reverse a deliberate decision: that a deleted preset
mark *survives locally* rather than being reconciled away. It would also add vault-wide state whose retirement
condition is unknowable (no preset can learn that every book has processed it) and a modal on book-open, which is
the worst moment to ask a question.

"Delete it everywhere", if ever wanted, is a separate, explicit vault-wide operation, not a side effect of
removing a row.

### A local mark deleted while in use

The book scope disables delete for tracked marks (`presets.delete_mark_tracked`, "turn it off for this book
instead"), so the only mark a reader can delete there is a **local** one — and a local mark has no upstream
template, so the survivor rule cannot apply. A plain delete would leave the annotations pointing at a dead id,
with three consequences, in increasing order of seriousness:

1. **The appearance outlives the meaning.** `Highlight.treatment` is stored on the annotation as a render
   fallback, so the passage keeps its full wash-and-stroke and means nothing.
2. **A confirm that promised annotations "keep their color" would be inaccurate** — they keep the treatment too.
3. **They become unfilterable.** `markKeyOf` is `annot.markId ?? NO_MARK`, so a dangling id is *not* the
   unmarked bucket; and `renderMarkChoiceList` builds rows from live marks plus `NO_MARK`. The annotation gets
   no row, `chosen.has(key)` is false for every possible selection, and it is dropped from every filtered
   export with no way to include it. That is the one that turns a cosmetic oddity into unreachable data.

It would also contradict the vocabulary the export dialogs teach: **Unmarked notes** exists because only a note can
be unmarked. Deleting an in-use local mark is the one operation that could manufacture an unmarked passage
selection.

### The rule — `decideThenDeleteMark`

**The choice is forced at delete time, in the one book that owns the mark.** Everything needed is in hand — the
mark is local, its annotations are in this book's `.orbis`, and the remap rows from §Switching presets are the
same question in the same shape.

- **Unused local mark** — deleted. Nothing to decide.
- **In-use local mark** — the confirm is a remap: *move these to another mark*, or *delete the selections*.
  "Keep in this book" is absent here, unlike a preset switch, because the mark being kept is the one going away.
- **Deleting the selections is offered only here**, for the reason the local/tracked split already draws:
  these annotations belong to one book, and that book is open.

**One write, not three.** Rewriting the marks, the highlights and the notes is the single
`saveBookPresetAndAnnotations` write, for the reason §Copying a mark into the book gives: a failure between them
would leave annotations pointing at a mark that no longer exists.

No delete path leaves an annotation keeping its appearance and losing its name, so no confirm string describes
that outcome.

### Deferred, deliberately

- **Vault-wide deletion of a preset mark.** Would need every `.orbis` enumerated and rewritten, including
  books the reader has not opened, from a settings dialog. The survivor rule is the answer.
- **Chained remaps** (remap onto a mark later deleted). The survivor rule and this dialog both operate on what
  is in use at the time, so a chain resolves one hop per deletion rather than needing to be recorded.
- **A dangling `markId` falling into `NO_MARK`** as a safety net, so that even an orphan created some other way
  stays filterable. That is a one-line change in `markKeyOf` and a behavior change to every filter, so it is its
  own decision; no path in the plugin creates an orphan.

---

## Detaching a book from its preset

A book can stop following a preset: **Stop using this preset**. `ensureBookAnnotationPreset` reads a falsy preset
id as "this book has never had one" and assigns the default, so a plain un-assign would undo itself on the next
open. `BookPreset.detached` is a stored flag, checked before the id anywhere that would otherwise treat empty as
never-asked. Same reasoning as `recordsSetupDone`: *two states that look identical need something to tell them
apart, and a flag is the honest thing rather than the lazy one.*

"No preset" is coherent because **a mark is a mark.** `BookMark` is `AnnotationMark & { local?: true }`, and the
flag records provenance and nothing else — `resolveMark`, the marks bar, `markKeyOf` and every export treat a
local mark and a tracked one identically. A book with five marks of its own works exactly like one tracking a
preset.

### What detaching does

Every mark becomes the book's own, and **the ids the library still owns are re-minted** — the same rule
`promoteBookToPreset` applies, for the same reason: the preset keeps its own copy of each mark, so reusing the
ids would let one id name two definitions the moment either side is edited. A mark that was already local keeps
its id, so its annotations never move. Roles and `hiddenMarkIds` follow the map.

The book and its rewritten annotations land in **one write**, as a promotion does.

### The three read paths, each guarded

| Path | Detached behavior |
|---|---|
| `ensureBookAnnotationPreset` | Returns before assigning a default *or* importing — this is the one that would silently undo the choice |
| `mergeBookPreset` | Returns the book untouched; an id match could only be coincidence, since detaching clears the id |
| `importBookPreset` | Never reached, so a detached book adds nothing to the recipient's library |

That last one is a small bonus for sharing: the marks travel in the `.orbis` copy as they always do, and the
recipient gets no import notice and no inactive preset appended to their list.

### Two buttons, not a toggle

**Stop using this preset** / **Use a preset…**, beside *Change preset…* in the same row.

Off is cheap and on is not. Re-attaching means a decision per mark in use, plus the `(color, treatment)` clash
between a local mark and an incoming one — which is the remap dialog, reached through *Use a preset…*. A toggle
whose "on" position opens a dialog is a toggle that lies, and this control rewrites annotation data, which is not
toggle weight. It is the same argument that makes *Change preset…* a button rather than a select.

**Offered on every attached book**, including one with nothing annotated yet. There is nothing to re-point
there, which is a reason it is cheap rather than a reason to withhold it, and the rule stays one sentence.

### Still true

Detaching is not a way to have annotations without marks. The book keeps every mark it had; it simply owns them.
The state §Switching presets exists to retire — a passage selection with an appearance and no meaning — is no
closer than it was.

---

## One appearance, one mark — and which one

`(color, treatment, treatmentColor)` is a mark's identity here. `isMarkAppearanceFree` refuses a second mark
wearing a taken appearance, because two marks that render identically are indistinguishable to a reader — and
because `resolveMark` resolves a color-only annotation, *everything made before marks existed*, by matching
**exactly one** mark. Duplicates make that ambiguous, so it returns nothing and a book's whole back catalog
stops resolving.

The switch and the merge enforce it as well as the editor.

### Where duplicates come from

Four shapes, none needing anything exotic:

| | |
|---|---|
| **Switch** | A carried mark meets an incoming one with the same appearance. Detach-then-reattach multiplies it, and duplicating a preset, copying a mark into a book and switching to the duplicate does it with no detach at all |
| **Merge** | A survivor kept because annotations use it, meeting a new template mark that reuses the freed appearance |
| **Merge** | A mark the book owns, meeting a new template mark that happens to match it. **The likeliest one**: you add a mark, the preset author later adds one that looks the same |
| **Merge** | A template EDIT moving a tracked mark onto an appearance a book mark holds |

### The rule: a mark the book owns holds its appearance

`clashOutcome` is the single decision, and the order matters because the branches overlap:

1. **Nothing a reader could tell apart** — `clashDifference` is null: same name, same badge, same active state.
   The preset's mark wins, silently. Keeping the book's would look identical and quietly stop that mark
   following the preset: a consequence nobody asked for and nobody could see. This outranks everything below,
   including "in use".
2. **The book's mark has never been used.** The preset's mark wins, silently. An unused mark is a definition,
   not meaning attached to passages; nothing moves and the only loss is the name it was given.
3. **Otherwise the book's mark holds its appearance**, and the preset's mark is *not added*. Annotations depend
   on it, and replacing it would relabel them — "Stuff I hate" becoming "Stuff I love" because both are a yellow
   underline.

**Usage, not hidden-ness, is the test.** A hidden mark with annotations on it is still meaning the reader
assigned; a visible mark with none is still just a definition. This is the same question `switchBookPreset`
asks to decide what to carry (`m.local || isInUse(m.id)`), extended rather than duplicated.

### No stored state, and that is what makes it work

The rule is positional: *is this appearance claimed by a mark the book owns?* It is re-asked on every merge and
every switch, so the outcome **is** the record. Nothing to tombstone, nothing to fall out of step, and no way
for a remembered decision to contradict what the marks actually say.

### The switch asks; the merge decides

A merge runs at book open, which is the worst moment to put a question in front of someone, so it takes branch 3
automatically. A switch has a dialog, so branch 3 becomes the default of a choice.

**And the plan is the mechanism — there is no second channel.** `changePreset` applies the reader's remap plan
to the annotations *before* calling `switchBookPreset`. Pick another mark for a clashing row and those
annotations move first, leaving the book's mark unused, so `clashOutcome` reaches branch 2 and the preset's mark
comes in. Choose **Keep in this book** and the mark is still in use, so it holds its appearance. There is no
separate `keep` set: the usage already carries the answer, and two sources for one decision drift apart.

### Getting the preset's mark later

A blocked mark is not queued — `mergeBookPreset` only runs its insertion pass when the template is *ahead*, and
replaying it on an equal revision is unsafe (the survivor rule legitimately drops unused template marks, so a
replay would re-add them). So freeing the appearance has to be what brings the mark in.

`adoptFreedPresetMarks` runs after **any** book-scope write rather than on a named trigger. Editing a mark's
appearance frees one; so does deleting the mark; enumerating triggers means forgetting one. It is idempotent and
returns the same object when there is nothing to do, so asking on every commit costs a comparison.

It cannot over-reach, and the reasons are worth stating because "add any template mark the book lacks" sounds
alarming: hiding leaves a mark *in* the book, so a hidden mark is not "lacking"; a mark the survivor rule dropped
is no longer in the template; and adding a mark to a preset bumps the revision, which the ordinary merge handles.
A late arrival is inserted in **template order**, not appended, so it lands where one that arrived on time would
have — order decides the quick row.

### What the reader sees

- **In the This book list**, a `*` after the name of any mark that is holding an appearance, with one legend
  under the list: *"A mark from the preset has the same appearance, so it is not added to this book. Change its
  appearance to bring the preset's mark in."* Line-level, because the question is "why is the preset's mark not
  here?" and the answer belongs on the mark that is the reason. Not a glyph — the row already carries two for
  the note and listening roles, a third would need hover, and `*` plus a legend works on a phone.
- **In the switch dialog**, a clash is a row rather than a warning block: a block saying "Marks that will be
  replaced" would describe a fate, and branch 3 means the reader is choosing. What a block could carry that a
  dropdown cannot — *which* mark it collides with and *how* they differ — is a muted line under the row, naming
  both marks, because appearance is not meaning and a count would not let anyone spot the case that matters.

### What to call the two sides

**"the book's mark" and "a mark from the preset"**, never "yours" and "theirs". Every mark is the reader's; the
distinction is a mark created for one book against one that comes from a preset — which is what the `This book`
and `Preset` badges already say.

---

## Migration

Every field is optional with a safe default (`data-migration.md`: "For schema changes within a file, read
defensively and fall back").

- A book with no `preset` key is given the default on open.
- Annotations with no `markId` render from `color`.
- **Assignment rewrites nothing.** Existing annotations gain marks by resolving on their color, and keep
  no `markId` until they are next recolored. Bulk-stamping ids on assign would be a silent mutation of
  user data to buy something resolution already provides; the rewrite that *is* wanted has a dialog in
  front of it (§Switching presets).

**The built-in preset's ids are fixed strings** — `ap_builtin`, and `mk_builtin_…` for its marks — never
generated. Each device seeds its own library, so with generated ids the built-in preset on a phone and the
identical one on a tablet would be different presets containing different marks, and a book annotated on either
would resolve nothing on the other. New presets keep generated ids; canonical ones there would silently merge
different marks into one identity.

**And it is read-only**, because a fixed id only means "the same preset everywhere" if the contents match
everywhere too. Left editable, two devices can hold different marks under one identity — divergence hiding
behind sameness, which is worse than two unrelated ids, since nothing signals that anything differs. Locked,
nobody can move it out of step with anybody else. What the lock stops is a *reader* editing it; Orbis changing
what it ships is covered by `BUILTIN_PRESET_REVISION` (below).

Locking is cheap only because the escape hatches are good, and they are:

- **This book** edits one book's copy without touching any template — the most common intent.
- **Duplicate** gives an editable copy of the whole set. It regenerates every mark id:
  two library presets sharing mark ids would make a mark id ambiguous library-wide, and remap-on-switch
  would see every id "already resolving" and skip the mapping, silently adopting the other preset's
  definitions.
- **Any preset can be made the default** (`isDefault`, movable), so "the built-in is locked" never means
  "you are stuck with the built-in". Deleting the current default hands `isDefault` back to the built-in,
  which cannot be deleted — so "there is always exactly one default" holds without scanning for a survivor.

Lock is derived from the id (`isBuiltinPreset`), not stored as a flag, so it cannot drift out of step with
the identity it protects. In the UI the built-in's controls are **disabled rather than hidden**, so the lock
is visible instead of leaving the reader hunting for buttons that exist everywhere else.

**The lock holds from every direction.** No path pushes a book's marks back into the built-in — the one preset
guaranteed to mean the same thing everywhere; **Save as new preset** is the right move for "I built something here
and want to keep it".

**`ensureBuiltinPreset()` runs on every load, not just first run.** "Present in every install" has to be
maintained rather than assumed: a device whose library lacks the built-in must not need a hand-edited `data.json`
to get it, which is not something a user can reasonably do on Android or iOS. It is idempotent (the built-in
cannot be deleted), inserts at the front, and claims `isDefault` only when nothing else does. Every device
converges on the shared identity by itself.

**The built-in is seeded from the five legacy colors** (`#FFEB3B`, `#A5D6A7`, `#90CAF9`, `#FFAB91`, `#CE93D8`),
all washes. Because `(color, treatment)` is unique within it and those five hexes are what every existing
annotation carries, assigning it to an existing book resolves the entire back catalog by color — old annotations
gain names retroactively with no rewrite. That is the difference between a feature that starts empty and one that
starts useful.

**The preset is named for its contents and its marks for their meanings.** It is **Orbis marks**, holding **Key
point**, **Quote**, **Question**, **Definition** and **Disagree** in that order — a starting vocabulary, not a claim
about anyone's yellow. A name describing where the preset came from ("Built-in") would teach nothing, and marks
named for their colors would teach that a mark *is* a color. The objection that it puts words in the reader's
mouth is answered by Duplicate, which is one tap and already the way past the lock.

Three things follow, all of them in `BUILTIN_MARKS`, one table:

- **Colors are stated per mark**, not read from the palette by index: reordering the marks would then hand each
  one its neighbor's hex, and a mark's hex is what resolves the back catalog. The set is fixed forever; the
  order is a presentation choice.
- **Badges are stated too** (`🔑 💬 ❓ 📘 ⚠️`), because a derived badge tracks the appearance — right for a badge
  nobody has thought about, wrong for these, where a recolored copy still means "key point". `changeAppearance`
  only re-derives a badge the reader never chose, so stating it is what makes it stick; clearing the field in the
  editor brings derivation back.
- **Key point leads**, and holds both roles: it is the mark a tap in the player applies, and what you highlight
  while listening and what you write a note about are the same act at different lengths.

**The revision moves when Orbis changes the contents.** `BUILTIN_PRESET_REVISION` is the version of what the
built-in *is*; Orbis bumps it whenever it changes the contents, and `installBuiltinPreset` replaces a stored copy
that is older. Without a bump:

- A device holds different contents under the same locked id, which is *exactly* the divergence the lock exists
  to prevent. "Reset every device" is not a fix, it is a chore that has to be done perfectly.
- The change never reaches the BOOKS. `mergeBookPreset` is forward-only and reads equal revisions as nothing to
  merge, so every already-annotated book would keep the old contents in its own copy for ever, whatever the
  library said.
- A factory reset is a sledgehammer for this: it also trashes that device's reading positions, clears its device
  values and regenerates its device id, so it re-offers the multi-device setup on its next book.

Replacing is safe precisely because the preset is read-only — there is no user edit under that id to overwrite —
and the vault's own decisions survive: position, `isDefault`, `inactive`, and `createdAt`, none of which are part
of what the preset *is*.

Everything after that is machinery that already exists. The hash moves, so the next sync scan stamps and publishes
it and the other devices adopt it. The revision moves, so the forward merge runs and each book picks up the new
contents on its next open — keeping its own mark *order*, which is the book's to decide, and keeping any mark the
reader made their own, per the survivor rule. The reconciliation machinery fires exactly once per change, which
is what makes the change arrive.

---

## Presets travel

The preset library is a type of its own in [multi-device sync](multi-device-sync.md), one file per preset, like
collections and note styles. A library of marks is something a reader builds once and wants everywhere, which is the
same argument that makes a dashboard travel.

### It is two decisions, and only one of them is yes

1. **Does the library travel?** Yes. One `itemsBinding`, the shape the other synced types use.
2. **Does the book's copy go away?** **No.** Its three justifications (§Why the book owns its preset) never depend
   on sync: deleting a preset cannot break a book, a book shared *from another vault* carries its own meaning, and
   per-book customization is not a special case. Sync can never cover the second one — a vault it does not reach is
   the whole point of that case.

Because templates converge, there is no machinery for a library that does not sync: no book-is-newer prompt, and
`mergeBookPreset` only ever runs in the direction it is restricted to. The merge, the survivor rule, the remap
dialog, promotion and per-mark tracking are independent of sync.

### What is not here

| | Why |
|---|---|
| A setting for whether imports arrive active | An import always arrives inactive (§Inactive presets) |
| The book-is-newer prompt, and a manager button that pushes a book's copy up into its preset | Templates converge, and local work is promoted with Save as new preset |
| An Annotations settings page | It would be one row; see below |

### The manager's door moves onto the reading page

The settings row that opens the manager is on **Annotations and reading behavior**: *Manage annotation presets and
how the reader behaves while you read.* The row is first on it, because a title that leads with Annotations has
lied if the eye does not find them in the first row. A page holding a single row whose only job is opening a
dialog would be a door in front of a door.

**Not at the settings ROOT.** Obsidian draws an `action` row in the accent color and without a chevron — the
correct distinction, since a chevron promises a page — but among rows that all navigate, the one that does not
reads as a mistake. Drawing the chevron ourselves would promise navigation and open a modal. Inside a page it is
simply a row, which is what action rows are for.

That page rather than a page of its own: annotating is what you do while reading, it already holds the note-deletion
confirmation, and the manager is reached from a palette command, the reader toolbar and the listening bar as well —
the settings entry is one door of four, which is the argument for not giving it a room.

### Inactive presets

`AnnotationPreset.inactive` means: *this preset is in the library so books can track it, but do not offer it to me
until I say so.* An import simply arrives inactive, so no setting decides it.

**It travels with the preset.** The whole library is shared, so a curation state traveling with it is
consistent — the same argument that carries `isDefault`.

**`inactive`, not "hidden", in the UI and in the field.** "Hidden" would describe a view filter; this travels and
is the state an import arrives in. The verbs follow: **Deactivate** / **Activate**.

### Deleting a preset that a book still uses brings it back

Auto-import stays — it is the answer for a book shared from another vault, and the alternative strands such a
book with a copy it renders from and no template it can ever track again.

Auto-import and a synced delete therefore interact, and the sequence is worth stating because it looks alarming and
is not:

1. The Mac deletes preset P. A tombstone travels.
2. The phone adopts the delete and drops P.
3. The phone opens a book assigned P, and the import recreates it from the book's own copy.
4. The phone stamps P. The clock has already seen the tombstone, so the new version is later, and P publishes as
   live.
5. The Mac adopts it. P is back on both.

**It converges — it is a resurrection, not a loop.** Each round needs a human to press Delete; nothing here churns
on its own. And because an import arrives inactive, what comes back stays out of every assignment list, so the wish
behind the delete is mostly honored even when the delete itself cannot be. The confirm also says the delete
travels (`presets.delete_travels`).

#### Why Delete does not detach the books using it

Detaching every book on the preset would make the delete stick — the marks become each book's own, nothing
re-imports. **It does not, for the same reason the delete is not blocked.** Orbis knows which preset a book
uses only while that book is open. Detaching the rest would mean opening and rewriting every `.orbis` in
the vault on a click in a settings dialog — a large write over files for books that may never be opened
again, driven by a scan whose answer is provisional in both directions (a book never opened has no file
yet; a stale file reports use that no longer exists).

It is also the worse outcome where it works. A book that re-imports its preset keeps tracking something and
can be re-pointed at any time; a book silently detached behind the reader's back has lost that, permanently
and invisibly, as the price of tidying a list. The reader who wants a specific book frozen has the button
for it, on that book, where the decision has the information it needs. **Delete removes a library entry and
nothing more.**

Skipping the import of a preset whose tombstone this device holds would make Delete stick, at the price of a book
that renders correctly and can never track anything again — invisible, which is the worse failure. **Recreation
over stranding.**

### The binding

`itemsBinding('presets', …)`, with three things the other bindings share:

- **The built-in publishes like everything else.** Every vault seeds a byte-identical copy, but `isDefault` lives
  on the preset, and *which preset is the default* is exactly what another device does not know. Held back, a
  seeded built-in carries no version, and `settleDefault` reads "no version" as "made here just now", so
  scaffolding would beat a reader's real default on any device that seeded it later; and making the built-in the
  default again could never reach another device at all, since the item carrying that fact would never travel.
  Publishing it is safe precisely because it is read-only: two copies differ in nothing but the flag.
- **A `settle` for `isDefault`**, one preset holding it. `settleDefault` lives in `sync/settle.ts`, generic over
  `{ id, isDefault }`, because two types have the rule for identical reasons and a second copy of it would be a
  second chance for the two to disagree about what "later" means. It runs before every comparison, not only after
  adopting.
- **An open book re-merges when its preset arrives**, since sync means a template can change while the book is
  being read. `applyAdoptedActiveStyle` is the precedent for threading just-adopted items through to the active
  view.

`revision` keeps its job — it is what the book's copy compares against, and it is unrelated to the sync
version, which is derived from the payload.

---

## Naming inventory

| Surface | Value |
|---|---|
| Doc | `annotation-presets.md` |
| Types | `AnnotationPreset`, `AnnotationMark`, `MarkAppearance`, `Treatment`, `BookPreset`, `BookMark` |
| Annotation field | `markId?: string` |
| Mark order | array position in `marks[]`; no `order` field |
| Mark badge | `badge?: string` — free text, not an emoji field |
| `.orbis` key | `preset` |
| i18n namespace | `presets.*` |
| CSS prefix | `.orbis-mark-*` |
| UI: the set | "Annotation preset" |
| UI: one entry | "Mark" |
| UI: the wash | "Highlighter" — never "Highlight", which is the annotation kind |

---

## Accessibility

Making color carry meaning would, on its own, make **color-only encoding an accessibility failure**:
a reader who can't distinguish the swatches could no longer distinguish the *categories*, which is
worse than swatches that meant nothing anyway.

The treatments are what stop that being true, and they are the reason this is a solution rather than
a mitigation. A preset of *highlighter · underline · double-underline · squiggle · box* is fully
usable with no color perception at all — the channel carrying meaning is shape, and color becomes
redundant reinforcement rather than the only signal. This is also why `(color, treatment)` uniqueness
is enforced on the pair: it is what guarantees a treatment-only preset is expressible.

Supporting pieces, in scope for the same reason: mark-name-on-tap (§Surfaces 2) so meaning is readable and not
just visible; mark names in the picker rather than only in settings; and treatment-aware contrast, since a wash
and a stroke have different legibility floors.

Worth noting the same design helps outside disability — bright sunlight, a low-brightness screen, and
the sepia theme all flatten color differences that shape survives.
