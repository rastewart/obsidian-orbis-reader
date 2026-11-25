# Orbis Reader — Design Documentation

Internal design documents for the Orbis Reader codebase. Start with [Plugin Architecture](plugin-architecture.md) if you're new to the code.

Each document describes the system **as it is**, in the present tense, and explains the reason behind each decision.
A rejected alternative appears only as a constraint that stops it being re-added. **What is built and what is next
lives in one place: [Roadmap](roadmap.md)** — a design doc carries no status of its own, so the two cannot disagree.

→ [Back to top-level docs](../README.md)

---

## Project

| Document | Description |
|---|---|
| [Roadmap](roadmap.md) | Phase-by-phase development plan with completion status |
| [Code Standards & Workflow](code-standards.md) | Build, deploy, lint, test, and Fallow analysis steps; code-quality bar |
| [Feature Development Guide](feature-development-guide.md) | Checklist for adding enhancements and capabilities: scoping, design, implementation, docs, testing, release |
| [Architecture Extension Guide](architecture-extension-guide.md) | How to add reader features while preserving the collaborator / `ReaderContext` / host-interface architecture |
| [Data Migration Guide](data-migration.md) | Best practices for reliable one-time vault and settings migrations |
| [Obsidian compliance](obsidian-compliance-plan.md) | What Obsidian's automated review and community-plugin guidance require, and what Orbis does about each — the per-requirement detail behind [Roadmap §5](roadmap.md) |
| [Security model](security.md) | What Orbis trusts and what it does not — a book, a catalog feed, a downloaded asset, a dependency — where each boundary is enforced, what is deliberately not defended, and how to check it still holds |
| [Documentation site](docs-site.md) | The user guide as a VitePress site for GitHub Pages: how the guide's Markdown becomes the site unchanged, what in the repository builds it, its dependencies, and the steps that put it online with the public repository |
| [Dependency Security](dependency-security.md) | Supply-chain policy for the ten libraries that ship: what each is for, pinning and why, the foliate-js upgrade procedure, and the quarterly audit |

---

## Architecture

| Document | Description |
|---|---|
| [Plugin Architecture](plugin-architecture.md) | Source layout, plugin lifecycle, settings storage, commands, deep-link protocol, vault file layout |
| [Reader architecture](reader-architecture.md) | How the reader is put together: `OrbisReaderView` as a lifecycle shell owning Foliate, the collaborators under `src/reader/` behind a narrow `ReaderContext` and single-consumer host interfaces, the subsystem map, and the rules that keep the view from regrowing |
| [Toolbar & Content Panel](toolbar-and-panels.md) | Toolbar buttons, content panel tabs, search bar, backlinks scanning, stats rendering, link preview, focus mode |
| [Dialog System](dialog-system.md) | `createOrbisPopup()` shared popup scaffolding, mobile keyboard-safe positioning, height-lock/nesting fixes, which dialogs use it vs. stay a real `Modal` |

---

## Reader Systems

| Document | Description |
|---|---|
| [Reading with the keyboard](keyboard.md) | Driving the reader without a mouse: forwarding keystrokes out of the book's iframe, page/chapter commands, focus after navigating, Tab seeding from the visible page, and selection by sentence and paragraph |
| [Annotations](annotations.md) | Highlights, notes, and bookmarks — data model, foliate-js overlay events, create/edit/delete flows, note margin icons |
| [Annotation Presets](annotation-presets.md) | User-defined annotation appearance that carries meaning: global presets assigned per book with the `.orbis` copy as source of truth, marks with a color + a treatment (highlighter / underline / squiggle / box) as a non-color channel, `markId` + hex on annotations, the list+editor manager, remap/divergence/import lifecycle, note-export impact.|
| [Reading Progress & Sync](reading-progress-system.md) | Per-device location files, cross-device sync prompt, pages cache, WPM sampling, progress display modes |
| [Reader themes](reader-themes.md) | The five themes always offered, the provided extras and the reader's own; switched off vs deleted; matching Obsidian's theme; the Theme manager; sync |
| [Display Styles](display-styles.md) | `DisplayStyle` data model, localStorage keys, device-default styles, style lifecycle, StorageEvent propagation |
| [Fonts](fonts.md) | Fonts beyond the system's: a vault folder that is looked through rather than listed, a family named by a quoted value so a move or a slow sync breaks nothing, reading a font file's own tables, importing with the four faces shown, `FontFace` per chapter document, what the Font list offers, and moving the folder |
| [Look-up](look-up.md) | Select text and find out what it means without leaving the book: three reorderable sections (offline dictionary, vault, web), two dictionaries that fail in opposite directions, the pinned build script and measured asset numbers, multi-word headwords, and where CC BY attribution goes |
| [Search System](search-system.md) | Full-text search algorithm, dual UI surfaces (panel + standalone bar), highlight colors, result grouping |
| [Listening (TTS & Recording)](text-to-speech.md) | The single listening design doc: engines (Web Speech + on-device Piper), the voice picker, the player (transport/scrubber/highlight/note/bookmark), pacing, wake lock + pocket-mode lock, OS media controls + the mobile ceiling, position sync, and recording generation |

---

## Vault Integration

| Document | Description |
|---|---|
| [Orbis Data View](orbis-data-view.md) | `.orbis` file format, `orbis-data/` folder, vault delete/rename handlers, OrbisDataView custom view |
| [Book Sources](book-sources.md) | OPDS catalogs as a capability of their own: sources with credentials in `secretStorage`, an acknowledgement before anything reaches the network, one request per user action, browse and search, and downloads into a vault folder — writing a title note when the Library is on.|
| [Library](library.md) | A catalog of what you have, present or not: a main-window `ItemView` opened from the ribbon, one note per title with folders and tags as shelves, files as optional attachments, Read and Listen as equal actions, an ownership map dividing the UX between Bases and custom code, discovery and bulk cataloging from the EPUB's own OPF, dashboards of widgets over collections, reading records as a second species, and the field table, collections and dashboards as files in the vault.|
| [Multi-device sync](multi-device-sync.md) | One rule for everything that travels between devices: `data.json` is the truth on each device, and the vault holds a published copy per device — one file per item per device, so no file is ever written twice and the sync tool never merges. Last-writer-wins per item, tombstoned deletes, a per-device counter beside the UTC clock, and an opt-in that asks the device its name.|
| [Book annotation sync](book-annotation-sync.md) | Proposed: each device writes its own changes to a book's marks, notes and bookmarks to a file of its own, and the book's `.orbis` is rebuilt from all of them, so changes made on two devices while apart all survive. Every other feature keeps reading `.orbis`. |

---

## Export Systems

| Document | Description |
|---|---|
| [Reading Records](reading-records.md) | One vault note per selection / note / bookmark plus generated Obsidian Bases views: frontmatter schema, `cfi_sort` reading-order key, global + per-book bases, live export, covers, cleanup.|
| [Markdown to EPUB](markdown-to-epub.md) | Turn a note, or a folder of notes, into an EPUB in the vault — or into one EPUB per note with a generated contents note. Sections cut at a chosen heading level, metadata from the frontmatter Book Export writes, an anchor map so internal links and footnotes survive the split, deep links between the books of a set, and the regeneration warning about CFIs. |
| [Read in Orbis Reader](read-in-orbis-reader.md) | One context-menu item that converts a note to an EPUB beside it and opens it with nothing asked — for the gap between clipping an article and reading it. Its own settings under Conversions but one shared converter, books found by convention and confirmed by sidecar, change detection over the body below the frontmatter, one question asked only when a changed note has annotations, and the rule for which settings sync. |
| [Marks to PDF](marks-pdf.md) | Send someone a PDF of every passage you marked and every note you wrote: `pdf-lib` drawing real text, chapters in table-of-contents order, marks drawn in both wash and treatment — as a digest of the marks, or as the whole marked-up document. |
| [Notes Export](notes-export.md) | Note Styles, Generate Notes dialog, single-file and per-chapter output formats, conflict resolution, merge/diff flow |
| [Book Export](book-export.md) | epub→Markdown extraction via foliate-js `createDocument()`, Turndown rules, image handling, output modes |

---

## UI & Terminology

| Document | Description |
|---|---|
| [Location Terminology](location-terminology.md) | The "loc./location" (not "page") convention: GoToDialog dual input (loc. or %); URI handler `loc=`/`pct=` params (`page=` deprecated); command/identifier naming |
| [Terminology](terminology.md) | Approved terms for the user guide and UI labels: writing rules, feature names, terms by area, and action verbs |
| [Glossary](glossary.md) | The terminology review of the user guide: each term's variants, the decision, and the reason for it. [Terminology](terminology.md) is the summary |
| [User Guide Writing Standard](user-guide-standard.md) | How to write the pages in `docs/guide/`: content, voice, sentence length, procedures, page structure, tables, examples and a review checklist |

---

## Quality & Testing

| Document | Description |
|---|---|
| [Integration Test Strategy](integration-test-strategy.md) | vitest unit tests, mock-vault pattern, fixture books, CI setup |
| [End-to-End Tests](end-to-end-tests.md) | `pnpm e2e`, the built plugin tested in a separate Obsidian on your computer; writing a test, golden files, known issues |
| [Test plans](test-plans/README.md) | Manual device tests, one page per system, each step tagged by the devices it runs on; how much to run after a build, a change and before a release |

---

## Tooling

| Document | Description |
|---|---|
| [Debug System](debug-system.md) | Category-filtered debug log panel, `orbis-dbg-*` localStorage keys, `addDebugEntry` signature, log format |
| [Accessibility](accessibility.md) | ARIA roles, keyboard navigation, `.title` → `aria-label` migration, color contrast, Foliate iframe limitation |
| [Localization](localization.md) | i18n framework: `t()` API, locale detection, key naming, type safety, plurals, string audit, contributor workflow |
| [Settings](settings.md) | Declarative `getSettingDefinitions()` on a drill-down tree of pages, the nine-entry map and why it is shaped that way, the three storage scopes and per-device labeling, keyboard/focus requirements, and the Setup page.|
| [First run](first-run.md) | What a reader meets the first time Orbis loads, and after an update: one per-device value holding the version last seen, so one flag answers both "welcome?" and "what's new?"; why it fires at `onLayoutReady` rather than at a book open; the rule that decides between the welcome and the multi-device offer when both want the same moment; and the two dev resets.|
