# Code Standards & Developer Workflow

← [Design Docs](README.md) | See also: [`CONTRIBUTING.md`](../../CONTRIBUTING.md) in the repo root

This document covers everything needed to develop Orbis Reader without
accidentally regressing code quality or Obsidian compliance. The short version
is in `CONTRIBUTING.md`; this is the full reference.

---

## Prerequisites

### Workflow linters

`pnpm lint:workflows` runs two tools that are not npm packages. Install them once — on macOS:

```sh
brew install actionlint zizmor
```

Elsewhere, each project's install page covers Linux and Windows:
[actionlint](https://github.com/rhysd/actionlint/blob/main/docs/install.md) and
[zizmor](https://docs.zizmor.sh/installation/).

zizmor asks GitHub whether each pinned action's hash is really in that action's repository, which needs a token: it
uses `GH_TOKEN` if set, otherwise the one `gh auth login` stored. With neither, it runs its offline checks and says
which ones it skipped. CI installs pinned release files of both, checked against their SHA-256; bumping either means
changing the version and the hash together in `.github/workflows/ci.yml`.

### Obsidian CLI

The deploy scripts use the [Obsidian CLI](https://obsidian.md/cli) to reload the plugin automatically after each deploy. Enable it once:

1. In Obsidian: **Settings → General → Obsidian URI** — enable the CLI toggle.
2. Restart Obsidian (or open a new terminal) so the CLI is added to your system PATH.
3. Verify: `obsidian version` in a terminal should print the version number.

Once enabled, the deploy scripts handle the full build-deploy-reload cycle without any manual steps in Obsidian.

---

## Quick build and deploy

**Test vault** (in-repo):

```powershell
.\deploy.ps1          # Windows
```

```bash
./deploy.sh           # macOS / Linux (bash equivalent of deploy.ps1)
```

Builds, copies `main.js` / `manifest.json` / `styles.css` to the test vault, and reloads the plugin via the Obsidian CLI. The `pnpm …` commands in the rest of this doc are the same on every platform.

**A vault of your own** — a synced vault you read in, say: copy `deploy.sh` or `deploy.ps1` and change its
destination folder. `.gitignore` already lists `deploy-local.sh` and `deploy-to-vault.bat` for this, so a script
that names your own vault's path is never committed.

> `deploy.ps1` touches file timestamps after copying so Obsidian detects CSS changes. Always use the deploy scripts instead of copying files manually.

---

## Pre-commit checklist

Run all of these before committing. CI will catch failures, but it's faster to fix locally.

```sh
pnpm check            # Biome — lint + format check of the whole repo, must return 0 errors
pnpm lint:obsidian    # ESLint (eslint-plugin-obsidianmd) — 0 errors; warnings counted for shipping code and tests apart
pnpm lint:i18n        # check-i18n.ts — every user-facing string goes through t()
pnpm lint:a11y        # check-a11y.ts — aria-label / label coverage
pnpm lint:orphans     # check-orphans.ts — i18n keys and orbis-* CSS classes nothing references
pnpm lint:vocab       # check-vocabulary.ts — retired words in the strings a reader sees, below
pnpm lint:links       # check-links.ts — Markdown links and cross-file anchors that point at nothing
pnpm lint:keyboard    # check-keyboard.ts — clickable with no keyboard path; focus captured and not restored
pnpm lint:size        # check-size.ts — the file-size ratchet, below
pnpm lint:workflows   # check-workflows.ts — actionlint and zizmor over .github/workflows
pnpm lint:md          # markdownlint — docs must pass
pnpm test             # vitest — all tests must pass
pnpm build            # type-check + bundle — must succeed
pnpm docs:build       # the documentation site (docs-site.md) — fails on a guide link that points at nothing
```

To auto-fix lint and formatting issues:

```sh
pnpm check:fix
```

### The size ratchet

`pnpm lint:size` holds every file over 900 lines to a number committed in `scripts/size-budget.json`. It exists
because a rule written in a design doc does not hold a file's size: a big file grows a few lines per commit, and
there is no single bad commit to catch.

It fails in four directions, and the second is the one that matters:

- **Over budget.** Put the code in a file that owns it. If the growth genuinely belongs there, raise the budget
  with `pnpm lint:size --update-budget` — a visible line in the diff, which is the point.
- **Shrunk by more than 20 lines.** Tighten the budget, again with `--update-budget`. Left alone, the slack an
  extraction earned is spent again by the next feature.
- **A new file crosses 900 lines.** A module becoming one of the places things get wired is worth one deliberate
  commit.
- **A budgeted file is no longer large**, so its entry is stale.

`i18n/` and `__tests__/` are exempt for reasons about the files rather than their size: a string table is
*supposed* to grow with every `t()` call, and a gate that punishes writing tests would undo the reason the big
files were split up in the first place.

### The vocabulary gate

`pnpm lint:vocab` fails on a word the product has retired — *Export to vault*, *Generate notes file*, *Safe mode*,
*audiobook*, *tap*, *click* — found in a translation key or in a string a reader sees. It exists because renaming
a command is easy and keeping it renamed is not: nothing else stops the next person reaching for the old name.

Three things about it are deliberate and worth not undoing:

- **It reads keys and values, never comments.** `en.ts` is full of retired terms on purpose — the comment beside a
  renamed string says what it was called and why it changed, and that is the only record of the reasoning. A check
  that read comments would fire on precisely the prose worth keeping.
- **An allow-list, not a baseline.** The other audits grandfather a baseline, which is right for a cleanup in
  progress and exactly wrong here: a baseline records what exists, every retired word is something that existed,
  so a baseline would capture every one of them and enforce nothing. An `allow` entry names one key and the
  decision behind it.
- **It checks the key as well as the value.** Someone reading *Save annotations as Markdown* on screen must not
  find `generate_notes` behind it. Rename a key with its string.

It finds a retired word, not a misleading one. A key called `export_tab.book_export` behind a string saying "Save
as Markdown" contains no retired word and is still wrong; that needs a person reading the table. `docs/design/` is
never scanned, for the same reason comments are not.

### The link gate

`pnpm lint:links` fails on a relative Markdown link pointing at a file that is not there, or at a heading that is
not there any more. **`lint:md` cannot do either**: markdownlint's MD051 validates a fragment against the headings
of the file it is written in and nothing else, so `other.md#old-anchor` rots in silence.

It slugs headings GitHub's way, because that is where these files are read. Two asymmetries are deliberate:
fenced blocks are dropped everywhere (a `# comment` in a shell example is not a heading), and inline code spans
are dropped when scanning for links but **kept** when collecting headings — GitHub slugs a heading from its
rendered text, so `` `.setting-item` `` contributes `setting-item` to the anchor. Getting that backwards reports
live headings as missing, and the fix a reader would reach for is editing the links until the gate is quiet.

---

## Fallow analysis

[Fallow](https://fallow.app) is the static analysis tool used for dead code, duplication, and complexity audits. Run it when you finish a significant chunk of work, before a release, or whenever the codebase feels like it's accumulating cruft.

Fallow stores its cache in `.fallow/` (gitignored). First run after a long gap will be slower.

### Full analysis (dead code + dupes + health)

```sh
pnpm dlx fallow
```

Runs all three analyses together. Use this for a broad health check.

### Individual analyses

```sh
pnpm dlx fallow dead-code   # unused exports, unreachable code, stale imports
pnpm dlx fallow dupes       # copy-paste and structural duplication
pnpm dlx fallow health      # complexity hotspots, maintainability scores, coverage gaps
```

### Audit changed files only

```sh
pnpm dlx fallow audit
```

Scopes analysis to files changed since the last commit. Useful as a quick pre-commit check on larger changesets.

### Reviewing Fallow output

Work through findings in priority order (Fallow shows a priority score). For each finding:

- **Dead code** — delete the export or file if it is truly unused. If it looks used but Fallow flags it, check whether it is only reached dynamically (e.g. plugin lifecycle hooks, registered commands) — add a comment explaining why, or suppress the finding.
- **Duplication** — extract a shared helper only when the duplication is a maintenance risk. Three similar lines is not a reason to abstract. Ask: *if one copy changes, must all copies change?* If yes, extract.
- **Complexity hotspot** — note which function and its score. Refactor if the function is also a change hotspot (frequently edited). Complexity alone is not sufficient reason to refactor stable code.

Fallow findings are not all bugs. Use judgment. Suppress false positives rather than working around them in the code.

---

## Running tests

```sh
pnpm test             # single run (vitest run)
pnpm test:watch       # watch mode — re-runs on file save
```

Test files live in `src/__tests__/`. See [Integration Test Strategy](integration-test-strategy.md) for the mock-vault pattern used for vault I/O tests.

**`pnpm test` also writes `.vitest-last-run.json`** (gitignored), the same run in machine-readable form. It is there
for the failure that does not reproduce: an intermittent single-test failure passes on the next run, and its name
scrolls past in the summary before it can be read. The file survives the run, so the failure can be named after
the fact:

```sh
node -e "const d=require('./.vitest-last-run.json'); console.log(d.testResults.flatMap(r=>r.assertionResults).filter(t=>t.status==='failed').map(t=>t.fullName))"
```

Node, not Python: the repository already needs it, and the same line runs in bash, zsh and PowerShell. It prints
`[]` when nothing failed.

Not the cause: clock-dependent tests (no test file reads `Date.now()` or `new Date()`) and fake timers (only
`nav-suppressor` uses them, deliberately).

---

## Dev mode (watch build)

```sh
pnpm dev
```

Runs esbuild in watch mode — rebuilds `main.js` on every file save, but does not copy to the test vault or reload the plugin. After each save, run the deploy script (`./deploy.sh`, or `.\deploy.ps1` on Windows) to push the change and reload, or use the Obsidian CLI directly:

```sh
obsidian plugin:reload id=orbis-reader
```

---

## Manual smoke test (required before every commit)

Run after `.\deploy.ps1`. Open **test-vault** in Obsidian and work through each check. Each step should take 5–10 seconds; total under 3 minutes.

**1 — Plugin loads**
- [ ] Open `First-Open.epub` (committed in `test-vault/fixtures/`) — book renders, no error notice.

**2 — Navigation**
- [ ] Paginated mode: click **‹** and **›** — pages turn smoothly.
- [ ] Switch to scrolled mode (Settings → Display → Scrolled layout toggle ON).
- [ ] Scroll down through a few sections, then back up.
- [ ] Switch back to paginated mode.

**3 — Display style menu**
- [ ] Click the palette icon — Theme/Layout/Spacing/Font tab row opens below the toolbar.
- [ ] Layout tab → check "Enable two columns" — text reflows into two side-by-side columns (paginated mode only).
- [ ] Font tab → drag the font-size slider right — text gets noticeably larger; drag left — shrinks back.
- [ ] Click the palette icon again (or press Escape) — menu closes.

**4 — Bookmark**
- [ ] Click the bookmark icon — icon fills solid and title changes to "Remove bookmark".
- [ ] Click again — icon returns to outline and title changes to "Bookmark this page".

**5 — Progress indicator**
- [ ] Click the centered progress label — cycles through book %, chapter %, book/chapter locations, book/chapter time remaining, then a blank stop, then back to book %.

**6 — Plugin reload (no crash)**
- [ ] In Obsidian, run **Reload app without saving** (or close and reopen the book tab).
- [ ] Book reopens at the same position, no error notice, no duplicate-element console error.

If any step fails, fix before committing.

---

## Typical workflow

1. Make a code change.
2. `pnpm dev` is running in the background — `main.js` is rebuilt automatically.
3. Run `.\deploy.ps1` to push to the test vault and reload the plugin.
4. When the session is done and you are ready to commit:
   - Run `pnpm dlx fallow audit` to catch anything in the changed files.
   - Run the full pre-commit checklist above.
   - Run `.\deploy.ps1` for a final clean build and test in Obsidian.
   - Commit.

---

## Obsidian compliance rules

These rules protect the ESLint-at-zero baseline. Violating them will fail CI.
See `docs/design/obsidian-compliance-plan.md` for the full rationale.

### Styling — no inline styles

Never use `element.style.foo = value` for static values. Use a CSS class in
`styles.css` instead. Dynamic values that must be computed at runtime (e.g.
pixel positions from `getBoundingClientRect()`, brightness percentages) may use
inline styles with an `// eslint-disable-next-line obsidianmd/no-static-styles-assignment`
comment that explains why the value cannot be a CSS class.

```ts
// ✗ never
el.style.marginLeft = '-12px';

// ✓ static — use a class
el.addClass('orbis-subheading');   // .orbis-subheading { margin-left: -12px }

// ✓ dynamic — disable comment required
// eslint-disable-next-line obsidianmd/no-static-styles-assignment -- computed from getBoundingClientRect
picker.style.left = `${Math.max(4, rect.left - 90)}px`;
```

`pnpm check` covers the whole repo — `src/`, `styles.css`, the build and lint
configs, and `scripts/` — so it fails on unformatted CSS or a stale import order
in a config file the same way it does on TypeScript. Run `pnpm check:fix` after
editing any of them rather than hand-matching the surrounding style.

**An unused import fails `pnpm check`.** `noUnusedImports` is an error, not a
warning, because warnings do not get actioned. The fix is `pnpm check:fix` with
`--unsafe` (removing an import is not a formatting change, so Biome will not do
it on a plain `--write`).

Two files are excluded, both in `biome.json`: `src/vendor/**` (third-party) and
`.fallowrc.json`, which is JSONC — fallow reads the comments in it, and Biome
parses a file before resolving overrides, so `json.parser.allowComments` cannot
reach it. `test-vault/**` is excluded too: Obsidian rewrites its own state files
there, so formatting them is churn that comes straight back.

### Type sizes — never hardcode px

Every font size in the plugin's **chrome** (toolbars, bars, dialogs, settings,
panels) comes from the Orbis type scale declared at the top of `styles.css`.
Never write a px font size.

```css
/* ✗ never */
.orbis-thing { font-size: 12px; }

/* ✓ use the scale rung */
.orbis-thing { font-size: var(--orbis-font-12); }
```

Rungs are named for the px size they resolve to at desktop defaults, so the mapping stays auditable:

| Rung | Derives from |
| --- | --- |
| `--orbis-font-8-5` / `-9` / `-10` / `-11` | `calc(var(--font-ui-smaller) * …)` |
| `--orbis-font-12` | `var(--font-ui-smaller)` |
| `--orbis-font-13` | `var(--font-ui-small)` |
| `--orbis-font-14` | `calc(var(--font-ui-small) * 1.077)` |
| `--orbis-font-15` | `var(--font-ui-medium)` |
| `--orbis-font-16` / `-18` / `-42` | `calc(var(--font-ui-medium) * …)` |

**Why it matters.** Obsidian's `app.css` declares
`--font-ui-smaller/small/medium/large` *twice*: as static 12/13/15/20px, and
again under `.is-mobile` as `calc()` over `--font-text-size`
(×0.8 / ×0.937 / ×1.0 / ×1.2). So deriving from those variables is what gives
each platform its correct behavior:

- **Desktop** — the variables are static, and the interface is scaled by
  Electron's window zoom (Cmd/Ctrl `+`/`-`), which scales px anyway. Orbis stays
  consistent with Obsidian's own dialogs. This matters most in the settings tab,
  which renders *inside* Obsidian's Settings modal alongside Obsidian-styled
  setting names and descriptions.
- **Mobile** — there is no window zoom, so Appearance → Font size is the only
  lever. Hardcoded px silently ignore it while Obsidian's own UI scales around
  them. Every rung resolves within 0.005px of its named size at desktop
  defaults.

Community themes that override `--font-ui-*` are picked up for free.

Two exclusions:

- **Book content** is not chrome — it has its own user control (`orbis-font-size`,
  applied as an `html { font-size: N% }` rule). See
  [display-styles.md](display-styles.md).
- **`em` / `%` sizes** already scale with their parent and need no rung.

Known gap: bar heights, button sizes, and paddings are still fixed px, so at the
maximum Appearance font size mobile layouts get crowded (tight but not broken).
Scaling those boxes — or capping the text — is open follow-up work.

### Document and window access

Use `activeDocument` (not `document`) and `activeWindow` (not `window`) for
anything that affects layout or event routing, so the plugin works correctly
in Obsidian's popout windows.

```ts
// ✗ never for DOM creation or querying
const el = document.createElement('div');
document.addEventListener('keydown', ...);

// ✓ always
const el = activeDocument.createElement('div');
this.registerDomEvent(activeDocument, 'keydown', ...);
```

Timer calls (`window.setTimeout`, `window.clearTimeout`) stay as `window.*` —
Obsidian's JS environment shares timers across all windows, and the ESLint rule
requires the explicit `window.` prefix to prevent Node type conflicts.
`requestAnimationFrame` at layout-critical sites uses `activeWindow.requestAnimationFrame`
to prevent Chromium throttling when the main window is hidden.

### Settings changes — workspace event bus

Never dispatch `StorageEvent` directly. All display-setting changes must go
through the workspace event bus so every open view updates regardless of which
window triggered the change.

```ts
// ✗ never
window.dispatchEvent(new StorageEvent('storage', { key, newValue }));

// ✓ always
this.app.saveLocalStorage(key, value);
this.app.workspace.trigger('orbis:settings-change', key, value);
```

The listener in `OrbisReaderView` uses `registerEvent` so it is automatically
cleaned up on unload:

```ts
// @ts-expect-error -- custom events are not typed in Obsidian's Workspace definition
this.registerEvent(this.app.workspace.on('orbis:settings-change', (key, value) => { ... }));
```

### Settings headings

The `obsidianmd/settings-tab/no-problematic-settings-headings` rule bans:
- The word "settings" in a heading
- The word "General" as a heading
- The plugin name in a heading
- The word "options" in a heading

Use descriptive names instead: "Preferences", "Toolbar", "Export", etc.

### Disabled settings rows

Never call `Setting.setDisabled()` on its own — use **`setSettingDisabled(setting, disabled)`** from
`ui-utils.ts`.

`setDisabled` disables the components inside the row but leaves the name, description and control at full
brightness. The result is indistinguishable from a bug: a `<select>` that shows its value and refuses to open
reads as broken. The helper adds `.orbis-setting-disabled` (dims the whole
`settingEl`) so the row fades as a unit.

Before reaching for it, ask whether the row should be disabled at all. A row holding a **default** usually should
not: gating the reading-records folder on the feature being on would mean you had to start writing before you were
allowed to say where, which is backwards. Disable a control when using it would be *meaningless*, not merely
inactive.

Custom grids that are not `Setting`s (the panel-tab and progress-mode toggle tables) dim their own label and cell
with `.orbis-dim-45` instead — same rule, different plumbing.

### Storage

Never access `localStorage` directly. Always use `app.saveLocalStorage(key, value)`
and `app.loadLocalStorage(key)`.

### Vault paths

Wrap every constructed vault path with `normalizePath()` before passing it to
any vault or adapter API call.

```ts
import { normalizePath } from 'obsidian';
const path = normalizePath(`${folder}/${filename}.md`);
await this.app.vault.create(path, content);
```

---

## UI and string standards

These rules apply whenever you add or change any user-facing text. The ESLint
`obsidianmd/ui/sentence-case` rule enforces sentence case automatically, but
the following are not lint-enforced and require manual review.

### Language principles

- **No technical jargon visible to users.** Avoid: "parsing", "mounting", "cfi",
  "epubcfi", "localStorage", "index", "MOC", "YAML", "initialize", "floating overlay",
  "device-specific", "variables" (say "placeholders" instead).
- **Touch-neutral language.** Say "select", not "click" or "tap" — users may be on
  either device. A guide that teaches a physical gesture names both ("right-click, or
  long-press on a touch screen"). `pnpm lint:vocab` enforces this.
- **No "feature".** Don't say "this feature", "save as Markdown feature", etc.
- **Imperative voice for descriptions.** "Scroll continuously through each
  chapter" not "Enables scrolling".
- **Obsidian's own terms.** Use "properties" for frontmatter key/value pairs.
  Use "vault" for the notes folder (users know this term from Obsidian).
- **Privacy-forward language** for anything involving data storage or sync.
  State clearly that data stays in the vault.

### Proper nouns and trademarks

The sentence-case ESLint rule does not understand trademarks. Add an
`// eslint-disable-next-line obsidianmd/ui/sentence-case -- trademark` comment
when a proper noun would be incorrectly lowercased (e.g. "iPhone", "macOS").

### Localization — all strings go through `t()`

Every user-visible string must be externalized via the `t()` function from
`src/i18n`. Never hardcode English in plugin logic.

This is enforced automatically: `pnpm lint:i18n` (also a CI step) statically
scans `src/**/*.ts` for hardcoded strings at the sinks below and fails the
build on anything new. Run it before committing — see [Localization § Automated
audit](localization.md#automated-audit) for how the baseline and suppression
comment (`// i18n-audit-disable-next-line -- <reason>`) work.

```ts
import { t } from './i18n';

// Static string
btn.setAttribute('aria-label', t('toolbar.toc'));

// Interpolated string — use named {{placeholders}}
new Notice(t('notices.error_opening_file', { path: file.path }));

// In a createEl call
pane.createEl('p', { text: t('stats_tab.gathering_data') });
```

**Adding a new string:**

1. Pick a dot-namespaced key that describes the UI area and the string's role,
   e.g. `generate_notes_modal.cancel_btn` or `notices.export_complete`.
2. Add the key and English value to `src/i18n/en.ts`. The TypeScript compiler
   enforces that every key used in plugin code exists in `en.ts`.
3. Use `{{varName}}` (double braces, named variable) for any dynamic value.
   Empty `{{}}` placeholders are silently ignored by the substitution regex —
   always name them.
4. Replace the string literal in source with `t('your.key')` or
   `t('your.key', { varName: value })`.

**Key naming conventions:**

| Prefix | Used for |
|---|---|
| `toolbar.*` | Toolbar button labels and tooltips |
| `notices.*` | `new Notice(...)` messages |
| `<modal_name>.*` | Strings scoped to a specific modal |
| `<tab_name>_tab.*` | Strings scoped to a settings or panel tab |
| `command_palette.*` | Command names registered with Obsidian |
| `tokens.*` | Template token names (documentation only) |
| `frontmatter.*` | Frontmatter key names (documentation only) |

**Parameter shadowing:** Obsidian's `Setting` builder uses `t` as a lambda
parameter name in some callbacks. If you hit a naming conflict, rename the
lambda parameter:

```ts
// ✗ shadows the imported t()
new Setting(el).addText((t) => t.setPlaceholder('…'));

// ✓ rename the lambda parameter
new Setting(el).addText((tb) => tb.setPlaceholder(t('key')));
```

### When to do a string review

Do a string review pass when:
- Adding a new modal, settings section, or command
- Adding more than 3–4 new user-facing strings
- Before any release

`pnpm lint:i18n` catches strings you forgot to route through `t()` at any of
these times too — but it's a safety net, not a substitute for reviewing
whether the string itself reads well (the language principles above aren't
lint-enforced).

---

## Adding new features — checklist

Before starting implementation, confirm:

1. Is there a design doc in `docs/design/`? For features that touch more than
   one file or introduce new UI, write the design first.
2. Does the feature add new settings? Follow the Settings headings rule above.
3. Does the feature add new user-facing strings? Add keys to `src/i18n/en.ts`
   and use `t('key')` at every call site. See the Localization section above.
4. Does the feature add new DOM event listeners? Use `registerDomEvent`.
5. Does the feature add new CSS? Add classes to `styles.css`; no inline styles
   for static values, and take font sizes from the Orbis type scale
   (`var(--orbis-font-*)`) rather than hardcoding px.
6. Does the feature touch vault paths? Wrap with `normalizePath`.

After implementation:

- Run the full pre-commit checklist (`pnpm check`, `pnpm lint:obsidian`, `pnpm test`, `pnpm build`)
- Run `pnpm dlx fallow audit` on changed files
- Run the manual smoke test
