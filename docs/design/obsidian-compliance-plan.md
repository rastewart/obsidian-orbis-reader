# Obsidian compliance

← [Design Docs](README.md)

What Obsidian's automated review and its community-plugin guidance require, and what Orbis does about each.
Sources: `docs/local/obsidian-plug-in-best-practices.md` (June 2026), and Obsidian's developer docs, checked
2026-11-18: [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin),
[Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines),
[Manifest](https://docs.obsidian.md/Reference/Manifest) and
[Developer policies](https://docs.obsidian.md/community-directory/developer-policies).

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

- [x] Create `versions.json` in repo root — `{ "0.1.0": "1.14.4" }`, matching `minAppVersion`
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

Optional: the Manifest reference lists `fundingUrl` as optional, a URL or an object of labelled URLs. Not needed
for submission.

- [ ] Decide on funding platform (GitHub Sponsors, Ko-fi, etc.), if any
- [ ] Add `"fundingUrl": "https://..."` to `manifest.json`

### 4.4 Add `authorUrl` to `manifest.json`

Optional, like `fundingUrl`. Not needed for submission.

- [ ] Add `"authorUrl": "https://..."` to `manifest.json`, if wanted

### 4.5 Confirm `styles.css` in release assets

- [x] `release.yml` uploads `styles.css` with `main.js` and `manifest.json` (2026-10-27)

### 4.6 Name and ID

The Manifest reference's rules: an ID of lowercase letters and hyphens that does not end with `plugin` or contain
`obsidian`, and a name in Basic Latin that has no "Obsidian" and no "Plugin" and is unique.

- [x] `orbis-reader` and "Orbis Reader" meet them, and neither is in `community-plugins.json`'s 10,569 plugins
      (checked 2026-11-18)

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

- [x] Test on iOS or Android (Obsidian mobile) — every test plan ran on Android, the iPhone and the iPad
      (2026-09-29 to 2026-10-09)
- [x] Check for Node.js/Electron API usage that breaks on mobile — the desktop-only routes, such as the save dialog
      in `outside-vault.ts`, are looked up when asked for, and a device without them shows no button
- [x] Fix mobile-specific issues or set `isDesktopOnly: true` — `isDesktopOnly` stays `false` (2026-10-10)

### 7.2 Large vault testing

- [x] Test with a vault of about ten thousand files, against a small one, on the Mac and Android (2026-10-10)
- [x] Profile `onload()`, vault event handlers, and backlinks scanning — from the debug log's timing lines; nothing
      grows faster than the vault, and the foreground stays under 100 ms on the Mac
- [x] Debounce or optimize any slow handlers — the sync scan listed its folder once per type; it now looks once per
      scan and reads its files in batches

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
- [ ] Optional, at submission (§8.3): listing screenshots in the listing editor — up to 5 desktop images at
      1200 × 800 and up to 5 mobile images at 900 × 1600, JPEG, PNG or WebP, up to 5 MB each. The README's
      images are other sizes, so these are captured or cropped for it

### 7.5 `moment` import source

Import `moment` from `'obsidian'`, not from npm.

- [ ] `import { moment } from 'obsidian'` **if** a `moment.locale()` call is ever added — Orbis does not use
      `moment`, so this is a rule for the day localization needs it

---

## Phase 8 — Release infrastructure

### 8.1 GitHub Actions release workflow

- [x] `.github/workflows/release.yml`: a pushed tag of `x.y.z` or `x.y.z-beta.N` is checked against the plugin's
      files (`scripts/release-check.ts`), the whole gate runs on the tagged commit, a job that can only read builds,
      and a job that runs only `gh` and the provenance attestation drafts the release with `main.js`,
      `manifest.json`, `styles.css` and `orbis-test-fixtures.zip`. First run `0.1.0-beta.1` (2026-11-15); four betas
      so far
- [x] No `v` prefix: the workflow triggers only on tags without one, and the release check refuses a stable tag
      that differs from `manifest.json`'s version

### 8.2 Version bump process

- [x] `pnpm bump <version>` changes `manifest.json`, `package.json`, `versions.json` and `CHANGELOG.md` together;
      the procedure, betas included, is *Publishing* in [Feature Development Guide](feature-development-guide.md)
      (2026-10-27)

### 8.3 Submission and review

The Submit your plugin page (2026-11-18): submission is through the Community directory, not a pull request to
`obsidianmd/obsidian-releases`. The directory reads `manifest.json` at the head of the default branch and installs
the GitHub release whose tag equals its version, with `main.js`, `manifest.json` and `styles.css` attached. Review is
automatic; the directory shows guidance for each error, a fix ships as a new release with a higher version, and the
plugin cannot be installed from Obsidian until no errors remain. Scanner results are under *Manage your plugin*.

- [ ] Publish the stable `0.1.0` release, with **Set as the latest release** ticked (Roadmap §5.7)
- [ ] Sign in to community.obsidian.md with the Obsidian account, link the GitHub account, which proves the
      repository is ours, and add the plugin
- [ ] Resolve every error the review reports, each in a new release
- [ ] Set the pricing label to **Free**, if the listing editor asks for one
- [ ] Optional: listing screenshots (§7.4)
- [ ] Announce in Obsidian forum (Share & Showcase) and Discord (#updates)

### 8.4 Before submission: Obsidian's lint

- [x] `pnpm lint:obsidian` (eslint-plugin-obsidianmd's recommended set) finds nothing in the code that ships; 4
      warnings remain in tests (2026-11-18)

### 8.5 Developer policies

[Developer policies](https://docs.obsidian.md/community-directory/developer-policies), checked 2026-11-18. They apply
to plugins listed in the Community directory.

| Policy | Where Orbis stands |
|---|---|
| No code obfuscated to hide its purpose | `main.js` is minified by esbuild, as most plugins are, and not obfuscated; the source is public |
| No ads loaded over the internet, and none outside the plugin's own interface | None |
| No client-side telemetry | None. The README's *Network use* says so |
| Must not install or update itself or its dependencies | Orbis never updates itself. Listening fetches the ONNX Runtime and espeak phonemizer WASM, the phonemizer's data and the voice models on first use, at the reader's request: fixed versions, with each WASM checked against a pinned digest on download and on every load (`asset-integrity.ts`). The JavaScript that runs them is bundled in `main.js`. Be ready to explain this if the review asks |
| README explains each remote service used, and why | The README's *Network use* table lists every host the shipping code reaches (checked against `src` 2026-11-18), and the speech server a reader can set up to record with, which receives the text it records |
| README explains any access to files outside the vault | The README's *Files outside your vault*: on a computer, the five exports' **Export…** button saves one file where the reader picks in the system save dialog (`outside-vault.ts`); a phone or tablet shares the file and writes nothing outside the vault |
| README discloses payment, accounts, static ads or server-side telemetry | None of them apply |
| A LICENSE file, the plugin's licence stated, and dependencies' licences complied with | `LICENSE` (MIT), `NOTICES`, `licenses/`, and the README's *License* section |
| No use of "Obsidian" that suggests a first-party plugin | The name and ID do not use it |
| Forks need the original author's approval | Not a fork. foliate-js, lamejs and the piper phonemizer's JavaScript are vendored libraries, credited in `NOTICES` |

### 8.6 Submission requirements for plugins

[Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins),
checked 2026-11-18. It extends the developer policies with six rules for plugins.

| Requirement | Where Orbis stands |
|---|---|
| `fundingUrl` only if donations are accepted; otherwise remove it | Not in the manifest (§4.3) |
| `minAppVersion` is the oldest Obsidian the plugin works with | `1.14.4`, with `versions.json` to match (§4.1) |
| Description: short, an action statement first, not "This is a plugin", at most 250 characters, ends with a period, no emoji, acronyms and trademarks capitalized | Met (§4.2) |
| A plugin that uses Node.js or Electron APIs, such as `fs`, `crypto` or `os`, must set `isDesktopOnly` to `true` | **Review risk.** `isDesktopOnly` is `false`, and three files reach Node or Electron through `window.require`, only when `Platform.isDesktopApp`: `outside-vault.ts` (Electron's save dialog and `fs`, to save an export outside the vault), `sources/hop-request.ts` (Electron's `net`, to check each redirect of a book download) and `share-probe.ts` (a developer probe). A phone or tablet never calls them, and each has a fallback when they are missing. If the review flags them, the choice is to drop those routes on the desktop, not to make Orbis desktop-only |
| Command IDs do not include the plugin ID, which Obsidian adds | No command ID contains `orbis-reader`; they start with `orbis-` (checked 2026-11-18) |
| All sample code removed | None left: no `MyPlugin`, `SampleSettingTab` or `SampleModal` in `src` |

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
