# Feature Development Guide

← [Design Docs](README.md)

This document is a checklist and decision guide for adding new functionality to Orbis Reader. Use it at the start of any development work to make sure nothing is overlooked.

---

## Terms

**Enhancement** — extends or modifies an existing system. The system already exists; this adds to it.
Examples: a new progress mode, a new highlight color, a new template token for Notes Export, a new panel tab.

**Capability** — introduces a net-new top-level feature. Nothing in the codebase currently does this.
Examples: dictionary lookup, reading goals, book clubs, word-frequency analysis, a new export format.

The distinction matters because a capability requires a design doc, a user guide doc, and likely new commands, settings, and vault data — work that an enhancement may not need. Capabilities are a superset: every item in the Enhancement checklist applies to a Capability too.

When in doubt, ask: *Can I describe this as "the existing X feature now also does Y"?* If yes, it's an enhancement. If the sentence requires inventing a new noun, it's a capability.

---

## Phase 1 — Scoping

Answer these questions before writing any code or design docs.

### Problem definition
- [ ] What user problem does this solve? Write one sentence: *"As a reader, I want to ___ so that ___."*
- [ ] Is this in scope for a book-reader plugin, or does it belong in a separate plugin?
- [ ] Does a community plugin already do this? If so, what is the reason to build it here?

### Feasibility
- [ ] Does foliate-js expose what is needed? (Check foliate-js source and its event model before committing.)
- [ ] Does the Obsidian API support what is needed? (FileManager, Vault, WorkspaceLeaf, MetadataCache, etc.)
- [ ] Which book formats does this apply to? Note any formats where it will not work (e.g., CBZ has no text and therefore no highlights, search, or CFI navigation).
- [ ] Does it require a minimum Obsidian version beyond what `manifest.json` currently declares?

### Conflicts and constraints
- [ ] Does this conflict with or duplicate any existing feature?
- [ ] Does it affect behavior that is currently working correctly? Identify the risk area.
- [ ] Does it affect Obsidian Sync behavior (data.json vs. localStorage vs. `!orbis-data/` files)?
- [ ] Are there any foliate-js licensing or attribution implications?

---

## Phase 2 — Design

Document the design *before* implementation. For a capability, create a new design doc. For an enhancement, update the relevant existing design doc.

### Questions to settle in the design
- [ ] **UI placement**: Where does the user interact with this? Choose one or more:
  - Toolbar button
  - Content panel tab
  - Settings page (which one?)
  - Modal / dialog
  - Command palette only (no persistent UI)
  - Context menu
  - Margin icon / inline overlay
- [ ] **Commands**: Does this need new commands? Should they be available globally (no reader required) or only when a reader is active?
- [ ] **Settings**: Does it add persistent settings? Which settings page? Is the setting synced (data.json) or device-local (localStorage)? What is the default value, and is it safe for existing users?
- [ ] **Data**: Does it write to the vault? If so: what folder, what naming convention, does it follow the `!orbis-data/` pattern, what happens when the file already exists?
- [ ] **Multi-view**: What happens when two reader views are open on the same or different books? Does the feature need to stay in sync across views via `refreshViews()` or StorageEvent?
- [ ] **Focus mode**: Is the new UI visible in focus mode? Should it be?
- [ ] **Degraded state**: What does the UI show while the feature is loading, or when its prerequisites are not met (page cache not built, no annotations, file missing)?
- [ ] **Rollback**: Can the feature be disabled (via settings toggle or by removing the code) without breaking existing data or other features?

### Design doc checklist
- [ ] Data model defined (interfaces, types added to `settings.ts` or `progress.ts`)
- [ ] State transitions described (how does the feature initialize, update, and tear down?)
- [ ] Edge cases listed (empty book, book with one chapter, very large book, offline/no sync)
- [ ] For a **capability**: create `docs/design/<feature-name>.md` and add it to `docs/design/README.md`
- [ ] For an **enhancement**: update the relevant existing design doc with the new section

---

## Phase 3 — Implementation Checklist

Work through these in order. Items marked **C only** are typically only needed for new capabilities.

### settings.ts
- [ ] New TypeScript interfaces or type aliases added
- [ ] New `STORAGE_KEY_*` constants added for any new localStorage keys (use `orbis-` prefix)
- [ ] New fields added to `OrbisPluginSettings` with a safe default in `DEFAULT_PLUGIN_SETTINGS`
- [ ] **Migration**: If changing an existing field's name or type, add a migration step in `OrbisReaderPlugin.onload()` — see `docs/design/data-migration.md` for the pattern (guard flag, idempotency, error handling)

### main.ts
- [ ] New commands registered in `onload()` with correct `id` (`orbis-<action>`) and `name`
- [ ] Global commands (no reader required) use `callback`; reader commands use `checkCallback` with `getActiveView()` guard
- [ ] **C only**: New protocol params handled in the `obsidian://orbis-nav` handler if the feature creates navigable state
- [ ] **C only**: New file extensions registered via `registerExtensions()` if the feature adds format support

### OrbisReaderView.ts
- [ ] New toolbar elements added in the correct position (see [Toolbar & Content Panel](toolbar-and-panels.md) for ordering)
- [ ] `applyToolbarVisibility()` updated for any new toolbar button with a matching `showXxxButton` setting
- [ ] New panel tab added to `buildCombinedPanel()` and `ALL_PANEL_TAB_IDS` if this is a new tab
- [ ] New foliate-js event listeners registered (inside the `iframe.contentWindow` postMessage handler)
- [ ] `onload()` / `onunload()`: any new DOM listeners, MutationObservers, ResizeObservers, or timers are registered and cleaned up

### OrbisSettings.ts
- [ ] New setting added to the right page of the settings tree (see [settings.md](settings.md))
- [ ] **C only**: New page added if the feature warrants its own settings section
- [ ] Setting description text is clear and written for a non-technical user
- [ ] Dependent settings are hidden when their parent toggle is off — the definition's `visible` predicate — not grayed: a control with no possible effect should not be on screen

### progress.ts
- [ ] New vault I/O functions follow the `readProgressJson` helper pattern
- [ ] New per-book vault files go in `!orbis-data/` with appropriate naming
- [ ] New data interfaces defined near the top of the file with other interfaces

### Other files
- [ ] `NotesDiffModal.ts` — update if the feature affects notes output or merge flow
- [ ] `book-extractor.ts` — update if the feature affects book export
- [ ] `manifest.json` — bump `minAppVersion` if a newer Obsidian API is required

---

## Phase 4 — Documentation Checklist

### Design docs
- [ ] **Enhancement**: update the relevant existing design doc to describe the new behavior
- [ ] **Capability**: create `docs/design/<feature-name>.md`; add it to the table in `docs/design/README.md` and `docs/README.md`
- [ ] `docs/design/plugin-architecture.md` — update if new commands, new file extensions, or new vault file layout
- [ ] `docs/design/toolbar-and-panels.md` — update if new toolbar button or panel tab
- [ ] `docs/design/settings-reference` equivalent — `docs/guide/settings-reference.md` updated for any new settings

### User guide docs
- [ ] Write and review every guide change against the [User Guide Writing Standard](user-guide-standard.md), including its review checklist
- [ ] **Enhancement**: update the relevant guide doc(s) under `docs/guide/`
- [ ] **Capability**: create `docs/guide/<feature-name>.md`; add it to `docs/guide/README.md` and `docs/README.md`
- [ ] `docs/guide/settings-reference.md` — add any new settings to the section for their page
- [ ] `docs/guide/getting-started.md` — update if the feature changes installation, book formats, or core navigation

---

## Phase 5 — Testing Checklist

### Automated tests
- [ ] Unit tests added for any new pure functions in `settings.ts`, `progress.ts`, `turndown-rules.ts`, or `book-extractor.ts`
- [ ] Integration tests added for any new vault I/O functions (mock-vault pattern; see `docs/design/integration-test-strategy.md`)
- [ ] CI passes (`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint:obsidian`, `pnpm lint:i18n`)

### Manual testing — golden path
- [ ] Feature works end-to-end with a standard epub (use `annotation-workhorse.epub` for many chapters, `converted-note.epub` for a single one — see `test-vault/fixtures/README.md`)
- [ ] Feature works for every supported format it applies to (epub / mobi / azw3 / cbz / fb2); document any format limitations

### Manual testing — edge cases
- [ ] Book with no chapters / single chapter
- [ ] Book with no annotations (for any annotation-related feature)
- [ ] Feature behaves correctly when two reader views are open simultaneously
- [ ] Feature behaves correctly in focus mode
- [ ] Feature behaves correctly in both paginated and scrolled layout
- [ ] Feature behaves correctly in single-column and double-column layout
- [ ] **If the feature writes vault files**: behavior when the file already exists; behavior with read-only vault
- [ ] **If the feature uses sync**: behavior when `!orbis-data/` files are missing; behavior after a sync conflict

### Performance
- [ ] Feature does not add work to hot paths: `relocate` (fires on every page turn), `storage` event handler, `draw-annotation` (fires for every visible annotation)
- [ ] No memory leaks: all event listeners added in `onload()` have corresponding cleanup in `onunload()`
- [ ] If the feature indexes or scans the vault (like backlinks), it caches results and does not re-scan on every render

### Mobile and accessibility
- [ ] Touch targets ≥ 44px for any new interactive elements
- [ ] No hover-only affordances (tooltips are fine; hover-reveal controls are not)
- [ ] New interactive elements are keyboard-navigable (focusable, respond to Enter/Space)
- [ ] Labels are present: buttons have `aria-label` or visible text; form fields have associated labels

---

## Phase 6 — Release Checklist

### The order of a release
Every release goes through these steps in order. A problem found at a step goes back to step 1 with the fix.
1. **The gate, locally.** `pnpm lint:obsidian` also lints the vendored code with the rules the Community directory
   reports, and checks for a literal assigned to a style as the directory reads that rule, so most of what its review
   would find is found here
2. **A branch, pushed, with a draft pull request to `main`.** CI runs on `main` and on pull requests to it, not on
   other branches
3. **The directory's review of the branch.** On the plugin's page at community.obsidian.md, **Review branch** scans
   it without a release. Repeat until it reports no errors. Build verification compares a rebuild with a released
   `main.js`, so it can only be confirmed after a release (step 7); before that, a copy of the tree with no `.git`,
   built in another folder, must give a `main.js` identical to the one built here
4. **Merge to `main`.** The release workflow refuses a tag that is not on `main`, a beta's included
5. **Betas from `main`** (*Publishing a beta*, below), tested on each kind of device. Quit and restart Obsidian
   after updating: a plugin reload keeps the earlier build's reader. Check that the beta's `main.js` is byte-identical
   to a local build of the same commit. A fix is the next `-beta.N`
6. **The release** (*Version bump*, *CHANGELOG* and *Publishing*, below). The CHANGELOG section is the release's
   notes, so it is agreed before it is committed
7. **The directory's review of the release.** **Check for new releases** on the plugin's page, and confirm that the
   review, build verification included, reports no errors. Then, while the entry is a draft, **Publish** it, and do
   the steps for a new listing in Roadmap §5.7

### Version bump
- [ ] Determine semver level:
  - **Patch** (1.0.x) — bug fixes and internal changes with no user-visible behavior change
  - **Minor** (1.x.0) — new enhancement or capability that does not break existing settings or data
  - **Major** (x.0.0) — breaking change to settings format, vault file layout, or removal of existing functionality
- [ ] In this repository, run `pnpm bump <version>`, such as `pnpm bump 0.2.0` — three numbers, no `v`. It changes
      four files at once: the `version` in `manifest.json` and `package.json`, a new `versions.json` entry at the
      manifest's `minAppVersion`, and a `CHANGELOG.md` section dated today with a placeholder in it. It refuses a
      version that is not higher than the current one.
- [ ] `versions.json` gets an entry on **every** bump, not only when the floor moves: Obsidian reads it from the
      GitHub repo (not the plugin folder, so `deploy.sh` does not copy it) to tell an older app which release it
      may install. `release-metadata.test.ts` fails if it is missing or disagrees with the manifest.

### CHANGELOG
- [ ] Replace the placeholder in the new section with entries under `Added`, `Changed`, `Fixed` or `Removed`. The
      release workflow refuses a section that still holds the placeholder, and the section becomes the release's
      notes on GitHub.
- [ ] For a capability: one paragraph describing what it does and how to use it
- [ ] For an enhancement: one or two sentences describing what changed
- [ ] If the release goes out on a later day than the bump, change the section's date to match

### Publishing
- [ ] Run the whole gate, commit and push to `main`, and wait for CI to pass
- [ ] Tag the commit and push the tag: `git tag -a 0.2.0 -m "0.2.0"`, then `git push origin 0.2.0`
- [ ] Pushing the tag starts `.github/workflows/release.yml`. It checks that the tag is on `main`, equals
      `manifest.json`'s version and has a `versions.json` entry and a filled-in CHANGELOG section; runs the whole
      gate on the tagged commit; builds in a job that can only read; and, in a job that runs only `gh` and GitHub's
      provenance attestation, creates a **draft** release with `main.js`, `manifest.json`, `styles.css` and
      `orbis-test-fixtures.zip` (the test plans' files, for *Download test fixtures (dev)*), and the CHANGELOG section
      as its notes
- [ ] Check the attestation: download the draft's `main.js` and run
      `gh attestation verify main.js --repo <owner>/obsidian-orbis-reader`. It names the tag and the workflow run
- [ ] On GitHub, open the draft under Releases and check its three files and its notes. Publish it with **Set as
      the latest release** ticked — a draft cannot be marked latest, and the `dictionaries` release holds that
      title until a plugin release takes it
- [ ] If the run fails or the draft is wrong, delete the draft on GitHub and the tag in both places
      (`git tag -d 0.2.0`, `git push origin --delete 0.2.0`), fix it, and start again from the top. Before
      publishing, that leaves no trace

### Publishing a beta
A beta is a release for testing before the stable one, installed through BRAT. The store never offers it: Obsidian
reads `manifest.json` from main and offers the release tagged with its version, in `x.y.z` form only.
- [ ] Do **not** run `pnpm bump`. Main keeps the last stable version while a beta is out, or the store would offer the
      beta's version to everyone
- [ ] Run the whole gate, commit and push to `main`, and wait for CI to pass
- [ ] Tag the commit with the version it leads up to and `-beta.N`: `git tag -a 0.2.0-beta.1 -m "0.2.0-beta.1"`, then
      `git push origin 0.2.0-beta.1`. The workflow refuses a beta of a version lower than `manifest.json`'s or one
      already tagged; `0.1.0-beta.1` is accepted while main says `0.1.0` and `0.1.0` is not tagged yet
- [ ] The workflow writes the beta's version into the released `manifest.json` only, and drafts the release as a
      **pre-release**, with a one-line note to edit if there is more to say. Check the attestation as for a stable
      release, and publish the draft with **Set as a pre-release** still ticked
- [ ] BRAT installs a beta for anyone tracking the latest version, so every BRAT user gets it unless they added Orbis
      Reader at a release tag. BRAT orders `0.2.0-beta.1` below `0.2.0`, so testers move to the stable release when it
      comes
- [ ] Ship the stable release as above, from `pnpm bump`. Later betas of the same version count up: `-beta.2`

### Pre-release review
- [ ] All new user-facing strings (command names, setting names, notice messages, modal headings, tooltips, `aria-label`s) go through `t()` — add the key to `src/i18n/en.ts` and see [Localization](localization.md). Run `pnpm lint:i18n` before committing; it's also enforced in CI.
- [ ] All new user-facing strings are clear and consistent with existing naming conventions
- [ ] No debug `console.log` statements left in the code
- [ ] No hardcoded paths, vault names, or device IDs

---

## Quick reference

| Question | Enhancement | Capability |
|---|---|---|
| New design doc? | No — update existing | Yes |
| New user guide doc? | Usually not | Yes |
| New settings page? | Rarely | Sometimes |
| New commands? | Sometimes | Usually |
| New vault files? | Rarely | Sometimes |
| Settings migration? | If changing existing fields | If changing existing fields |
| Semver level? | Patch or minor | Minor |
| New unit tests? | If pure functions added | Yes |
| New integration tests? | If vault I/O added | Usually |
