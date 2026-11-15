# Obsidian compliance

← [Design Docs](README.md)

What Obsidian's automated review and its community-plugin guidance require, and what Orbis does about each.
Source: `docs/local/obsidian-plug-in-best-practices.md` (June 2026).

**This is the detail behind [Roadmap §5](roadmap.md#phase-5-pre-submission), not a second status board.** The
roadmap says whether the pre-submission work is done; this says exactly which API, which file and why. Tick an
item in both, in the same commit — a checklist nobody ticks is worse than no checklist.

Items are ordered by phase; later phases depend on earlier ones.

---

## Phase 1 — Tooling: Add eslint-plugin-obsidianmd

- [x] Install `eslint` (v9) and `eslint-plugin-obsidianmd`
- [x] Create `eslint.config.mjs` (flat config, uses `obsidianmd.configs.recommended`)
- [x] Add `lint:obsidian` script to `package.json`
- [x] Add "Obsidian lint" step to `.github/workflows/ci.yml`
- [x] `lint:obsidian` passes at zero violations

---

## Phase 2 — Critical API violations

Each item gives the approach for its ESLint rules, and flags best-practice work
that ESLint does not enforce.

### 2.1 `window` timers and `activeWindow`

The `prefer-window-timers` rule requires `window.setTimeout` (not bare
`setTimeout`).

Every call that affects layout or event routing in a secondary window goes
through the active window:

- Viewport dimensions for picker and note popup positioning use
  `activeWindow.innerWidth` / `activeWindow.visualViewport`
- A settings change is `app.workspace.trigger('orbis:settings-change', key, value)`,
  never `window.dispatchEvent(new StorageEvent(...))`, and it is heard through
  `registerEvent(app.workspace.on(...))`, not `registerDomEvent(window, 'storage')`
- `unhandledrejection` is registered with `registerDomEvent(activeWindow, ...)`
- The two layout-critical sites (flow-toggle repaint, note icon positioning
  double-rAF) use `activeWindow.requestAnimationFrame`, each with an
  `eslint-disable` comment explaining that it prevents Chromium throttling when
  the main window is hidden or on a different monitor

`window.setTimeout/clearTimeout` calls are intentionally `window.*`. The ESLint
rule requires this prefix (to avoid Node type conflicts), and timers are shared
across all windows in Obsidian's JS environment.

- [x] Replace bare `setTimeout/clearTimeout/requestAnimationFrame` with `window.*`
- [x] Migrate layout-critical `window.*` calls to `activeWindow.*` for popout support

### 2.2 `document` → `activeDocument`

DOM calls use `activeDocument` (imported from `'obsidian'`); `src` has no
direct `document.*` reference.

- [x] Replace all `document.*` with `activeDocument.*`
- [x] Import `activeDocument` from `'obsidian'`

### 2.3 `element.style.*`

The `no-static-styles-assignment` rule passes. Two categories of cases:

1. **Static values** — named CSS classes in `styles.css`.
2. **Dynamic values** (e.g. computed brightness, position) — cannot be CSS
   classes; suppressed with `// eslint-disable-next-line` and explanation
   comments.

- [x] Audit all `.style.*` assignments
- [x] Move static style assignments to CSS classes
- [x] Add targeted disable comments with explanations for dynamic assignments

### 2.4 `innerHTML`

All `innerHTML` uses are trusted static SVG literals injected into toolbar
buttons. The `no-inner-html` and `no-unsanitized/property` rules are suppressed
per-site with explanations. No user input reaches these paths.

- [x] Suppress `innerHTML` violations with explanation comments

### 2.6 `localStorage` → `App#saveLocalStorage`

Display-setting persistence uses `app.saveLocalStorage/loadLocalStorage`.
Settings changes travel on the workspace event bus (§2.1); `src` dispatches no
`StorageEvent` and calls no `window.dispatchEvent`. The `fetch` blob-URL
intercept in `foliate-patches.ts` is suppressed with explanation.

- [x] Migrate `localStorage.setItem/getItem/removeItem` to app storage API
- [x] Remove `StorageEvent` dispatch; replace with workspace event bus
- [x] Document retained `fetch` use

### 2.7 Promise handling

`no-misused-promises` and `no-floating-promises` pass.

- [x] Async callbacks wrapped with `void` or restructured

### 2.8 Unsafe TypeScript

`no-unsafe-*` and `no-unnecessary-type-assertion` pass.

- [x] Type assertions and guards added throughout

### 2.9 `console` and command name

- [x] `console.log/info` replaced with `console.debug`
- [x] Plugin-name prefix removed from offending command

### 2.10 `normalizePath()` on vault paths

Not enforced by ESLint but checked by the Obsidian automated reviewer. Every
vault path built from a template literal is wrapped before it reaches the API.

- [x] Import `normalizePath` from `'obsidian'` in each affected file
- [x] Wrap every constructed vault path with `normalizePath()`

---

## Phase 3 — Vault API compliance

### 3.1 `vault.modify()` → `vault.process()`

Rewriting an existing file goes through `vault.process()`, not `vault.modify()`.

- [x] Replace `vault.modify(file, content)` with
      `vault.process(file, () => content)` where content is pre-computed
- [x] For NotesDiffModal merge flow: use `vault.process(file, () => computeResult())`

### 3.2 `vault.read()` audit

- [x] `OrbisDataView.ts` — reading `.orbis` for display: switch to `cachedRead()`
- [x] `NotesDiffModal.ts` — reading files to diff: keep `read()` (need on-disk state)
- [x] `OrbisReaderView.ts` — reading file before appending: keep `read()`

### 3.3 `FileManager.trashFile()` for deletions

`main.ts` uses `vault.adapter.remove()` when cleaning up `.orbis` data files on
book rename/delete — internal data, not user notes.

- [x] Evaluate whether `fileManager.trashFile()` is appropriate for these cases
  or whether `adapter.remove()` is intentional (internal data files).
  Document the decision in code comments.

### 3.4 `FileSystemAdapter` cast guard

`src` has no `FileSystemAdapter` cast, so no guard is needed.

---

## Phase 4 — Manifest & versioning

### 4.1 Create `versions.json`

Required for the community plugin directory.

- [x] Create `versions.json` in repo root — `{ "0.1.0": "1.13.1" }`, matching `minAppVersion`
- [x] Update on every version bump going forward — `release-metadata.test.ts` fails if the current version is
      missing or its floor disagrees with the manifest, because the plugin's own `validate-manifest` rule cannot
      fire on a `.json` file (it keys off `physicalFilename` but is registered under `**/*.{ts,js}` globs; checked
      on eslint-plugin-obsidianmd 0.4.2)

### 4.2 Update plugin description

Must start with an action verb. Max 250 characters, ends with a period, no emoji.

- [x] Rewrite without "Obsidian", which the review bot asks for — where the description is read, Obsidian is a given
- [x] Update in `manifest.json` — *"Read, listen to and annotate ebooks in your vault, and make your reading part of
      your knowledge base."* (101 chars). Starts with an action verb, as the guidance asks. Guarded by
      `release-metadata.test.ts`
- [x] Match `package.json` — the same sentence, with "Obsidian vault", since the review bot does not read it

### 4.3 Add `fundingUrl` to `manifest.json`

- [ ] Decide on funding platform (GitHub Sponsors, Ko-fi, etc.)
- [ ] Add `"fundingUrl": "https://..."` to `manifest.json`

### 4.4 Add `authorUrl` to `manifest.json`

- [ ] Add `"authorUrl": "https://..."` to `manifest.json`

### 4.5 Confirm `styles.css` in release assets

- [ ] Add `styles.css` to the GitHub Actions release workflow (Phase 8)

---

## Phase 5 — New Settings API (Obsidian 1.13+)

The `getSettingDefinitions()` API registers each setting as a structured object,
enabling Obsidian's global settings search to index plugin settings and improving
keyboard/screen-reader accessibility. The deprecated `display()` approach renders
raw HTML that Obsidian cannot inspect.

- [x] Implement `getSettingDefinitions()` in `OrbisSettings`
- [x] Replace `display()` refresh calls with `update()` where required
- [x] Remove raw HTML heading elements; use new API section headings
- [x] Remove all `no-deprecated` suppress comments once migrated — none remain

Full design: [Settings](settings.md). The one deliberate exception is a page whose
list can be reordered from the keyboard, which Obsidian's declarative rows cannot do.

---

## Phase 6 — Resource cleanup

### 6.1 `registerDomEvent()` for raw DOM listeners

The annotation-popup and link-preview `activeDocument.addEventListener` listeners
live in the `AnnotationController` / `LinkPreview` collaborators (`src/reader/`),
each with its own `dispose()` for cleanup.

- [x] Replace raw `activeDocument.addEventListener` calls with
      `this.registerDomEvent(activeDocument, ...)` where not already cleaned up
      in `onunload`

### 6.2 DeferredViews support

- [x] Research what DeferredViews requires for a custom `ItemView`.
- [x] Determine if `OrbisReaderView` and `OrbisDataView` need updating.
- [x] Implement if required.

---

## Phase 7 — Testing & polish

### 7.1 Mobile testing

`isDesktopOnly: false` in the manifest, so the plugin must work on Obsidian mobile.

- [ ] Test on iOS or Android (Obsidian mobile)
- [ ] Check for Node.js/Electron API usage that breaks on mobile
- [ ] Fix mobile-specific issues or set `isDesktopOnly: true`

### 7.2 Large vault testing

- [ ] Test with a vault containing 1000+ notes and 20+ epub files
- [ ] Profile `onload()`, vault event handlers, and backlinks scanning
- [ ] Debounce or optimize any slow handlers

### 7.3 Sentence case audit

All UI strings must be in sentence case; ESLint enforces this. A manual string
review keeps user-facing text free of technical jargon, developer-speak and
informal abbreviations. Conventions it holds:

- `Placeholders:`, not `Variables:`, in template editors
- `Use new version` in the diff modal
- `Average`, not `Avg`; `table of contents`, not `TOC`; `wpm` is kept (a standard unit)
- Privacy-first framing for location sharing
- An `eslint-disable` for a trademark such as "iPhone" (a proper noun, not a sentence-case violation)

- [x] Spot-check command names, button labels, notices, and `aria-label` values
- [x] Manual review of all dynamically-built strings

### 7.4 Screenshots

Not a submission requirement (Obsidian's developer docs, checked 2026-10-22). The README is required, and the
listing page shows an excerpt of it, with its relative images rewritten to resolve against the repository.
Screenshots are a separate, optional field of the listing, set in the Community directory's listing editor — not
release assets.

- [x] README screenshots under **Screenshots**: the reader on a computer, listening on a tablet, and the audio player
      on a phone, with the overview picture at the top (`docs/images/`)
- [ ] Optional, at submission (§8.4): listing screenshots in the listing editor — up to 5 desktop images at
      1200 × 800 and up to 5 mobile images at 900 × 1600, JPEG, PNG or WebP, up to 5 MB each. The README's
      images are other sizes, so these are captured or cropped for it

### 7.5 `moment` import source

Import `moment` from `'obsidian'`, not from npm.

- [ ] `import { moment } from 'obsidian'` **if** a `moment.locale()` call is ever added — Orbis does not use
      `moment`, so this is a rule for the day localization needs it

---

## Phase 8 — Release infrastructure

### 8.1 GitHub Actions release workflow

No release workflow exists yet. CI workflow exists at `.github/workflows/ci.yml`.

- [ ] Create `.github/workflows/release.yml`:
  - Trigger: `push` to tags matching `[0-9]+.[0-9]+.[0-9]+`
  - Steps: checkout → install → build → create GitHub Release →
    upload `main.js`, `manifest.json`, `styles.css`
- [ ] Ensure tag format has no `v` prefix (Obsidian requirement)

### 8.2 Version bump process

- [ ] Document the manual version bump process:
  1. Update version in `manifest.json`
  2. Update version in `package.json`
  3. Add entry to `versions.json`
  4. Add entry to `CHANGELOG.md`
  5. Commit, tag (no `v` prefix), push tag

### 8.3 Pre-release scan

- [ ] Sign in to `community.obsidian.md` and connect GitHub account
- [ ] Run preview scan on release branch/tag before publishing
- [ ] Address any "Required" violations before creating the GitHub release

### 8.4 Initial submission

- [ ] Submit via `community.obsidian.md` developer dashboard
- [ ] Set pricing label: **Free**
- [ ] Optional: listing screenshots (§7.4)
- [ ] Announce in Obsidian forum (Share & Showcase) and Discord (#updates)

---

## Notes

**`prefer-window-timers` vs `activeWindow`**: The ESLint rule `prefer-window-timers`
requires `window.setTimeout` (not bare `setTimeout`). Timer calls intentionally
stay as `window.*` — Obsidian's JS environment shares timers across all windows,
so `activeWindow.setTimeout` provides no benefit there. Layout-critical
`requestAnimationFrame` calls use `activeWindow.rAF` (Phase 2.1) to prevent
Chromium throttling in popout windows.

**`display()` deprecation**: `getSettingDefinitions()` (Phase 5) replaces it,
and no `no-deprecated` suppress comment remains.

**`innerHTML` for SVG icons**: All `innerHTML` uses inject trusted static SVG
literals from compile-time constants — no user input involved. Suppressed with
per-site explanation comments. Could be replaced with `createSvg()` in a future
cleanup pass, but not required for compliance.

**`vault.adapter.*` vs Vault API**: Several adapter calls (`list`, `rmdir`,
`exists`) have no direct Vault API equivalent and are intentional.
`normalizePath()` (Phase 2.10) is still required on all paths passed to them.

**Phase ordering**: Phases 3 and 4 are independent and can be worked in
parallel. Phases 7–8 come after Phases 2–4.
