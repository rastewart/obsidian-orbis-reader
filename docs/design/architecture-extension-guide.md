# Architecture Extension Guide

← [Design Docs](README.md)

How to add reader features **without** growing `OrbisReaderView` back into a God object. Every feature subsystem is
an owned collaborator under `src/reader/`; the view is the shell that owns Foliate and the lifecycle.

The shell is where the Foliate handle and the lifecycle live, so it is always the easiest place to put a new
feature. The rules below are backed by a gate: `pnpm lint:size` holds each large file to a committed number and
fails on growth — and on an extraction that does not tighten its own budget afterwards. See
[the size ratchet](code-standards.md#the-size-ratchet). [Reader architecture](reader-architecture.md) describes the
shape they protect.

This is the **architecture** companion to the [Feature Development Guide](feature-development-guide.md)
(which covers product scoping, settings, docs, release). Read that for *what* to build
and this for *where the code goes*.

---

## The shape in one picture

```
OrbisReaderView  (the shell)
  ├─ owns: Foliate lifecycle, the relocate orchestrator, display/rendering,
  │        the toolbar, navigation primitives, and the wiring below
  ├─ implements: ReaderContext + the host interfaces
  └─ constructs, in order: search → bookmarkCtl → annot → stats →
                            linkPreview → readerDom → locIndex → panels

Collaborators  (src/reader/*.ts)
  ├─ each owns its own fields + a dispose()
  ├─ depend on ReaderContext (shared surface) — never on the view class
  └─ depend on their own <X>Host (single-consumer surface) when they need
     something only they read
```

Three dependency surfaces, in order of preference:

1. **`ReaderContext`** — the *shared* reading surface (`src/reader/ReaderContext.ts`).
   Members that **more than one** collaborator legitimately reads: `app`, `contentEl`,
   `currentFile`, `foliateView`, `currentSectionIndex`, `closePanel()`, the reading-position
   fields (`lastCfi`, `lastLocation`, …), etc. The file is the source of truth for its members.
2. **A single-consumer `<X>Host` interface** — when exactly one collaborator needs a
   (possibly wide) slice of the view. The view implements seven: `FocusModeHost`,
   `AnnotationHost`, `StatsHost`, `PanelsHost`, `LinkPreviewHost`, `LocationIndexHost`,
   `TtsHost`.
   The view implements each; the collaborator takes it as a second constructor arg.
3. **A direct sibling reference** — reserved for one case (see below).

---

## The rules

### 1. Data ownership: the writer owns it

**Whoever mutates a piece of state owns it.** It becomes a private field of that
collaborator. Everyone else *reads* it through a `ReaderContext` getter or a host getter —
never a second copy. When you find yourself wanting to duplicate a field, that is the
signal to add a getter instead.

Example: the reading-position fields (`lastCfi`, `lastLocation`, `lastLocationCfi`, …) are
written only by the view's relocate handler, so they stay on the view and are exposed
read-only on `ReaderContext`. `BookmarkController` and `AnnotationController` read them;
neither owns them. Conversely `LocationIndex` owns the whole char-counting index
(`sectionLocInfo`, word/char counts, `tocStartFractions`), and `ReadingStats` reads that
through `StatsHost` — because `LocationIndex` is the sole writer.

### 2. `ReaderContext` vs. a host interface: shared vs. single-consumer

- Needed by **two or more** collaborators (or clearly will be) → add it to `ReaderContext`.
- Needed by **exactly one** collaborator → put it on that collaborator's `<X>Host`, even
  if the slice is wide. `StatsHost` is deliberately fat (book structure + word counts +
  progress-mode settings) because only `ReadingStats` consumes it; widening the shared
  `ReaderContext` with single-consumer members is what re-bloats the surface everyone sees.

`ReaderContext` grows **one reviewed member at a time**. A new member is a decision, not a
reflex — confirm the shape against the actual call site, and never add speculatively. If a
collaborator wants something not on the context, first ask whether the dependency is
legitimate or a smell.

### 3. Cross-collaborator communication: prefer host callbacks over sibling refs

When collaborator A needs to trigger work in collaborator B, **route it through the view**
via a host callback rather than handing A a direct reference to B. The view is the hub;
this keeps the collaborator graph a tree, not a web, and avoids two-way edges.

Example: `LocationIndex` must tell `ReadingStats` to recompute after it (re)builds. It
does **not** hold a `ReadingStats` ref — it calls `LocationIndexHost.invalidateChapterBoundaries()`
/ `indexReady()`, which the view routes to `stats`.

**The one sanctioned exception:** `ReaderPanels` holds direct references to `search`,
`stats`, `bookmarkCtl`, and `annot`. It sits at the top of the stack and coordinates the
data tabs; routing ~20 forwarding calls through a fat host would be pure ceremony.
Dependencies point *down* the construction order (panels is built last), so there is no
cycle. Don't generalize this to other collaborators.

### 4. Circular-import discipline

Collaborators import the **`ReaderContext` interface**, never `OrbisReaderView` the class.
Importing the class couples the collaborator to the whole view and risks a circular
import. For the same reason a host interface lives in its own `<X>Host.ts` file, or in the
collaborator's own module when only that module uses it (`FocusModeHost` in `FocusMode.ts`,
`RecordsHost` in `RecordsController.ts`). Keep `ReaderContext` in its own file.

### 5. The view keeps thin delegators

Command-palette entry points and any pre-existing public method stay on the view as
one-line delegators so external call sites don't churn. E.g. `closePanel()` →
`panels.close()`, `navigateToLoc()` → `locIndex.navigateToLoc()`, `toggleBookmark()` →
`bookmarkCtl.toggle()`. The command is registered against the view; the logic lives in
the collaborator.

### 6. Every collaborator has a `dispose()`

State cleanup lives next to the state. `dispose()` is this subsystem's share of
`resetFileState()` — clear fields, release DOM handles, cancel timers. The view
calls `this.<collaborator>.dispose()` on book close. (Note `DebugLog` deliberately retains
its entry buffer across book opens — only DOM handles are released.)

---

## Cookbook

### Add a command

Register it in `main.ts` (`orbis-<action>` id; `checkCallback` + active-view guard for
reader commands, `callback` for global). Point it at a **thin view delegator** that calls
the owning collaborator. Add the display string to `src/i18n/en.ts`. See the
[Feature Development Guide](feature-development-guide.md) for the settings/docs/release checklist.

### Add a toolbar button or panel tab

Toolbar buttons are built in the view's toolbar builder (respect `applyToolbarVisibility`
and any `showXxxButton` setting). A new **panel tab** goes through `ReaderPanels`
(`src/reader/ReaderPanels.ts`) and `panel-utils.ts` (`ALL_PANEL_TAB_IDS` / `visibleTabIds`);
if the tab renders data owned by another collaborator, have `ReaderPanels` delegate to it
(that's why it holds sibling refs) rather than duplicating the data.

### Add a whole new subsystem (a collaborator)

1. Create `src/reader/<Name>.ts` exporting a class whose constructor takes
   `(private readonly ctx: ReaderContext)` — plus a `<Name>Host` second arg **only if** it
   needs single-consumer view internals.
2. Put all the subsystem's state in private fields. Add a `dispose()`.
3. If it needs a shared value not on `ReaderContext`, add one reviewed member (rule 2).
   If it needs a single-consumer slice, define `<Name>Host.ts` and `implements` it on the view.
4. Construct it in the view's collaborator sequence (mind ordering — a collaborator that
   others reference must be built before them; `panels` is last).
5. Route the relevant commands and Foliate events to it; keep thin view delegators.
6. Extract any intricate **pure** logic into a sibling module (e.g. `stats-math.ts`) and
   unit-test it — see below.

### Communicate with a sibling collaborator

Add a callback to *your* host interface and have the view route it to the sibling
(rule 3). Only `ReaderPanels` takes direct sibling refs.

### Extract pure logic for tests

DOM/Foliate-bound classes aren't unit-tested directly. Instead, pull the intricate,
layout-independent logic into a pure function module and cover it densely — this is the
house pattern (`stats-math.ts`, `bookmark-utils.ts`, `panel-utils.ts`, `search-utils.ts`,
`export-format.ts`). The class becomes a thin orchestrator that forwards state into the
pure function. See [Integration Test Strategy](integration-test-strategy.md).

---

## Guardrails specific to the reader

- **`relocate` ordering.** The view's relocate handler fans out to the collaborators in a
  fixed sequence. `relocate` fires on every page turn — keep new work off it or make it
  cheap, and preserve the existing order (subtle timing regressions otherwise).
- **`draw-annotation` ordering.** The dispatch order is `annot.tryDrawNote` →
  `search.tryDrawHit` → `annot.drawDefaultHighlight`. Preserve it.
- **No behavior drift.** There are no reader-level automated tests (only the pure-logic
  modules are unit-tested), so structural changes lean on the manual smoke pass. Keep
  changes small enough that the manual pass stays credible.
- **Vocabulary.** Internal identifiers use **location / loc**, not page — commands
  (`orbis-go-to-location`), methods (`navigateToLoc`, `recalculateLocations`), fields
  (`locWordCounts`, `paceTimerLoc`). Genuine screen-pagination terms (`paginated`,
  "next page") stay "page". The on-disk `<book>.pages.json` filename is a kept
  holdover. See [Location Terminology](location-terminology.md).

---

## The quality gate (run before every commit)

```bash
pnpm exec tsc -noEmit -skipLibCheck   # types
pnpm check                            # Biome lint + format
pnpm lint:obsidian                    # ESLint (obsidianmd): 0 errors, warnings split by shipping/tests
pnpm lint:i18n                        # every user-facing string via t()
pnpm lint:a11y                        # aria-label / label coverage
pnpm lint:md                          # markdownlint
pnpm test                             # vitest (all suites)
pnpm build                            # production bundle
```

(`pnpm dlx fallow dead-code | dupes | health | review` on changed files is the periodic
structural check — see [Code Standards](code-standards.md).)

## The device smoke pass (required — no reader-level automated tests)

After the gate, deploy (`.\deploy.ps1` on Windows, `./deploy.sh` on macOS/Linux) and
exercise the changed subsystem **on Mac desktop AND on Android**. The mobile
keyboard/selection behavior is the most refactor-fragile surface, so any change touching
dialogs, selection, focus mode, or the search/note popups must be validated on-device on
both platforms before the commit. See [Test plans](test-plans/README.md) for the page that covers the changed
system and [Dialog System](dialog-system.md) for the mobile height-lock
pitfalls.
