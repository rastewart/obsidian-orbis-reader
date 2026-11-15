# Localization

← [Design Docs](README.md)

Localization (i18n) externalizes all user-visible strings into locale files so contributors can translate Orbis Reader without touching plugin logic. This document covers the architecture, the `t()` API, locale detection, type safety, and contribution workflow.

---

## Scope

### What is localized

- Command palette command names and descriptions
- Settings tab headings, setting names, and setting descriptions
- Modal and dialog headings, button labels, and field labels
- Toolbar button tooltips — set via `aria-label`. Localization covers `aria-label` values on all interactive elements.
- Content panel tab labels
- Notice messages shown to the user (migration notices, export success, errors)
- Placeholder text in inputs
- Confirmation prompts
- Template tokens (`{{title}}`, `{{author}}`, etc.) — locale aliases work alongside canonical English tokens; see [Token aliases](#token-aliases) below
- Frontmatter keys in plugin-generated notes and export files — controlled by a user setting; see [Frontmatter key language](#frontmatter-key-language) below

### What is NOT localized

- Debug panel log entries — these are developer-facing; keeping them in English makes support easier
- Internal identifiers: command IDs, localStorage keys, CSS class names, view type strings
- File names, folder names, and vault paths

---

## Architecture

### File layout

```
src/i18n/
  index.ts        — t(), resolveToken(), resolveFrontmatterKey(), locale loading, initI18n()
  en.ts           — English base; canonical source of all keys, tokens, and frontmatter keys
```

English is the only locale that ships. A translation is a new file beside `en.ts` — `de.ts`, `es.ts`, and so on — added by a contributor following the contribution workflow below. The `en.ts` file is the single source of truth; all other locale files are validated against it by the TypeScript compiler.

### Key design

Keys are flat dot-namespaced strings grouped by UI area. Flat keys (rather than nested objects) keep the `t()` call simple and ensure TypeScript can enforce the key type in a single union:

```typescript
// src/i18n/en.ts
const en = {
  // The reader toolbar
  'toolbar.search_in_book':          'Search in book',
  'toolbar.bookmark_this_location':  'Bookmark this location',

  // A settings page: its rows, and the dialogs it opens
  'listening_page.orbis_voices':      'Orbis voices',
  'listening_page.orbis_voices_desc': 'Neural voices that run on this device and work offline. …',

  // What two settings pages share
  'pdf_pages.default_folder':        'Default folder for PDF files',

  // A content-panel tab
  'search_tab.searching':            'Searching…',
```

**Namespaces follow the surface.** A settings page's strings, and those of the dialogs it opens, are `<page>_page.*`
(`listening_page`, `library_page`, `properties_page`); strings two pages share get a namespace of their own
(`pdf_pages`); page titles are `settings_pages.*`; a content-panel tab's are `<tab>_tab.*`; a dialog that belongs to
no page is named for itself (`file_diff_modal`). A key that moves to another surface is renamed with it.

The `as const` assertion makes the key union derivable at compile time, so `TranslationKey` is the exact set of keys in `en.ts` — adding or removing a key from `en.ts` immediately updates the type.

#### Naming a key

A key names **what the string is for**, not what it says. Never a slugified copy of the English:

```typescript
// ✗ the string as an identifier — and it stops matching the moment the wording changes
'annotations_page.this_highlight_color_is_selected_by_de': 'This highlight color is selected by…',

// ✓ names the setting; survives a rewording
'annotations_page.default_color_desc': 'This highlight color is selected by…',
```

Descriptions take a `_desc` suffix on the thing they describe (`listening_page.orbis_voices` / `listening_page.orbis_voices_desc`). Namespaces are named after the **UI area**, never after the class or file that renders it — `file_diff_modal`, not `file_diff_modal_filediffmodal`.

A slug key drifts silently: truncated, it is nonsense, and once the string is reworded it describes text that is no longer there. Renaming a key is safe and cheap (`TranslationKey` makes tsc find every call site), so fix a key that no longer fits rather than leaving it.

---

## The `t()` function

```typescript
// src/i18n/index.ts
import en, { TranslationKey, Translations } from './en';

let active: Translations = en;

export function initI18n(locale: string): void {
  const lang = locale.toLowerCase().split('-')[0]; // 'zh-cn' → 'zh'
  try {
    // Dynamic require; esbuild bundles all locale files at build time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(`./${lang}`) as { default: Partial<Translations> };
    active = { ...en, ...mod.default }; // English fills any missing keys
  } catch {
    active = en; // Unknown locale → English
  }
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const raw = active[key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
}
```

**Key properties:**

- **Type-safe keys** — `TranslationKey` is the union of all keys in `en.ts`. Passing an unknown key is a compile error.
- **Fallback** — if the active locale is missing a key (partial translation), `en[key]` is used instead.
- **Interpolation** — `{{name}}` placeholders are replaced using the `vars` object. Unknown placeholders are replaced with an empty string.
- **No runtime imports** — esbuild bundles all locale files; no async loading or dynamic `import()`.

### Usage in plugin code

```typescript
import { t } from './i18n';

// Static string
button.setAttribute('aria-label', t('toolbar.toc'));

// Interpolated string
new Notice(t('notice.migration.error', { path: sourcePath }));

// In a createEl call
this.contentEl.createEl('p', { text: t('search.results.none') });
```

---

## Locale detection

Obsidian exposes the active language via `moment.locale()`. Orbis calls `initI18n` once in `OrbisReaderPlugin.onload()`, before any UI is rendered:

```typescript
// src/main.ts
import { initI18n } from './i18n';
import moment from 'moment';

async onload(): Promise<void> {
  initI18n(moment.locale()); // e.g. 'en', 'de', 'zh', 'ja'
  // ... rest of onload
}
```

Obsidian does not change its language at runtime, so a single call at plugin load is sufficient. Re-initialization on language change is not supported; the user must reload Obsidian.

---

## Type safety for locale files

Each locale file exports a `Partial<Translations>` default — partial because translations may lag behind `en.ts` as new keys are added. English fills any missing keys at runtime via the spread in `initI18n`.

```typescript
// src/i18n/de.ts
import type { Translations } from './en';

const de: Partial<Translations> = {
  'toolbar.toc':    'Inhaltsverzeichnis',
  'toolbar.search': 'Suche',
  // ... remaining keys
};

export default de;
```

TypeScript enforces that any key present in a locale file is a valid `TranslationKey` — misspelled or removed keys cause a compile error. Missing keys do not — partial translations are intentional.

---

## Plurals

English distinguishes one/other (e.g., "1 result" vs "5 results"). Other languages have more complex plural rules. Plurals use separate keys:

```
'results.one':   '{{count}} result'
'results.other': '{{count}} results'
```

Call site:

```typescript
const key = count === 1 ? 'results.one' : 'results.other';
t(key, { count });
```

A count notice can instead use a single key with an `(s)` suffix:

```typescript
new Notice(t('notices.locations_updated_for_n_annotations', { n: total }));
// en.ts: 'Locations updated for {{n}} annotation(s)'
```

The dual-key pattern is the recommendation for any string where the `(s)` shortcut reads
awkwardly.

This is intentionally simple. If a target language requires more than two plural forms (e.g., Slavic languages), it can override both keys with the most common form and accept minor grammatical imprecision, or add additional keys (`'results.few'`, `'results.many'`) that the call site checks via `Intl.PluralRules`. There is no general `Intl.PluralRules` support.

---

## Token aliases

Template tokens (`{{title}}`, `{{author}}`, etc.) appear in user-written templates. Two rules govern token resolution:

1. **Canonical English tokens always resolve** — a token written as `{{title}}` works in every locale, forever. This is the stability guarantee.
2. **Locale alias tokens resolve when that locale is active** — a Spanish user can write `{{título}}` and it resolves to the same value as `{{title}}` while Spanish is active. If the user switches to French, `{{título}}` stops resolving (French aliases apply instead).

### Alias map in locale files

Each locale file exports an optional `tokenAliases` map alongside its translation strings:

```typescript
// src/i18n/es.ts
const es: Partial<Translations> = {
  'toolbar.toc': 'Tabla de contenidos',
  // ...
};

export const tokenAliases: Record<string, string> = {
  'título':    'title',
  'autor':     'author',
  'fecha':     'date',
  'etiquetas': 'tags',
  // ...
};

export default es;
```

### Resolution function

```typescript
// src/i18n/index.ts
let activeTokenAliases: Record<string, string> = {};

export function resolveToken(rawToken: string): string {
  // Locale alias takes priority; falls back to the canonical name unchanged.
  return activeTokenAliases[rawToken] ?? rawToken;
}
```

Call site in the template renderer:

```typescript
// Replace {{tokenName}} using resolveToken so locale aliases work.
template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
  const canonical = resolveToken(name);
  return tokenValues[canonical] ?? '';
});
```

### UX implication

The template editor and any helper UI that suggests tokens to the user should show the locale alias names (e.g., `{{título}}` for Spanish users), not the canonical English names. The English tokens remain valid in stored templates even when the locale is later changed, but they will not be surfaced in the UI for non-English users.

---

## Frontmatter key language

Frontmatter keys appear in plugin-generated files: companion notes and book export output. Unlike template tokens (which users write themselves), these keys are written by the plugin, so the plugin's choice of key name affects the user's vault directly.

### User setting

A plugin setting controls which key names are used:

| Setting value | Behavior |
|---|---|
| `native` (default) | Keys use the active locale's names (e.g., `fecha_lectura:` for Spanish) |
| `english` | Keys always use canonical English names (`date_read:`) regardless of locale |

The default is `native` — a user who has not changed the setting sees keys in their own language, which is the expected experience. Users who rely on Dataview queries keyed on English field names should switch to `english`.

**The setting has no row in settings, because it cannot do anything yet.** `src/i18n/` ships
`en.ts` alone and `en.ts` exports no `frontmatterAliases`, so `activeFrontmatterAliases` is permanently `{}` and
both values resolve to the canonical key: `english` short-circuits, `native` searches an empty map and falls
through to the same answer. A control with one effective value asks for a decision that cannot change a file, and
"Native" promises localized keys that do not exist.

The stored setting, both callers (`export-format.ts` writes keys, `markdown-epub.ts` reads them) and its place in
`shared-settings.ts` all exist, so shipping a locale with `frontmatterAliases` makes it real with no rebuilding.
Two rules for when the row is added:

- **It does not belong on Book export.** Its only callers are Generate notes and Notes to EPUB, so Book export is the
  one export it never touches. A page shared by several exports is the right home.
- **The description's `date_read` example is wrong.** `library/status.ts` writes that key as a plain literal that
  never passes through `resolveFrontmatterKey`, so it is not an example of this setting at all.

### Key alias map in locale files

Each locale file exports an optional `frontmatterAliases` map:

```typescript
// src/i18n/es.ts
export const frontmatterAliases: Record<string, string> = {
  'fecha_lectura': 'date_read',
  'último_abierto': 'last_opened',
  'progreso':      'progress',
  // ...
};
```

### Frontmatter resolution function

```typescript
// src/i18n/index.ts
let activeFrontmatterAliases: Record<string, string> = {};

// Returns the key to write, based on the user's setting.
export function resolveFrontmatterKey(canonicalKey: string): string {
  if (settings.frontmatterKeyLanguage === 'english') return canonicalKey;
  // Find the locale alias for this canonical key, or fall back to English.
  const entry = Object.entries(activeFrontmatterAliases).find(([, v]) => v === canonicalKey);
  return entry ? entry[0] : canonicalKey;
}
```

### Cross-locale behavior and known trade-off

If a user exports notes while in Spanish, then changes locale to French:
- Previously exported files retain Spanish frontmatter keys (`fecha_lectura:`)
- New exports use French keys (`date_de_lecture:`)
- The vault now contains a mix of key names

This is a documented trade-off, not a bug. Users who need consistent keys across locale changes should set **Frontmatter key language → English**.

### At English-only launch

With only the English locale shipped, `native` and `english` produce identical output, so the setting has no row in
the UI. See [User setting](#user-setting) above for what exists and the two rules for when the row is added.

---

## String audit

> The plain-text-string part of this audit (not the token/frontmatter-key inventories below) is
> enforced automatically on every build — see [Automated audit](#automated-audit) below. This section
> explains *what* counts as a user-visible string; the script doesn't replace that judgment, it
> makes sure nothing found this way slips back in unnoticed.

Every user-visible string in the codebase goes through `t()`. This map shows where they live:

```
Where user-facing strings live:
  src/OrbisReaderView.ts     — toolbar labels (.title attributes), panel tabs, context menus,
                               notices, popups, pane menu items (.setTitle())
  src/OrbisSettings.ts     — all setName(), setDesc(), placeholder(), addButton().setButtonText();
                               also the custom tab bar labels (createEl('button', { text: tab }))
  src/display-menu.ts        — Display Style menu tab labels, drawer labels, dropdown option text,
                               button titles (Theme/Layout/Spacing/Font tabs and all their controls)
  src/NotesDiffModal.ts      — modal heading, button text, field labels
  src/BookExportModal.ts     — modal heading, button text, field labels
  src/main.ts                — command names, notice messages, migration notices
  src/OrbisDataView.ts       — section headings, empty-state messages, table headers
  src/reader/*.ts            — the reader collaborators (AnnotationController, SearchController,
                               ReaderPanels, ReadingStats, DebugLog, LinkPreview, …) hold
                               many t() call sites
```

For each UI string:
1. Assign a key in the namespace of the surface it appears on (e.g., `reading_page.open_mode`)
2. Add the key and English value to `en.ts`
3. Replace the string literal in the source with `t('key')`

Any string missed stays in English for all locales.

### Token inventory audit

Audit all template token names used in the codebase and documentation:

1. List every canonical token name (`title`, `author`, `date_read`, etc.)
2. Add each to `en.ts` under a `tokens.*` namespace for documentation purposes
3. For each future locale file, contributors populate `tokenAliases` with their language's equivalents

### Frontmatter key inventory audit

Similarly, audit every frontmatter key the plugin writes to vault files:

1. List every canonical frontmatter key (`date_read`, `last_opened`, `progress`, etc.)
2. Add each to `en.ts` under a `frontmatter.*` namespace
3. For each future locale file, contributors populate `frontmatterAliases` with their language's equivalents

---

## Automated audit

`scripts/check-i18n.ts` (run via `pnpm lint:i18n`, and as a CI step on every push/PR) statically scans
`src/**/*.ts` for hardcoded strings at the same sinks described in [What is
localized](#what-is-localized) above: `new Notice(...)`, the Obsidian `Setting`/`Modal`/`Menu` builder
methods (`setName`, `setDesc`, `setTitle`, `setPlaceholder`, `setTooltip`, `setButtonText`),
`setAttribute('aria-label' | 'title', ...)`, `.title`/`.placeholder`/`.textContent`/`.innerText`
assignments, the `text`/`title`/`placeholder`/`aria-label` keys of `createEl()`/`createDiv()`/
`createSpan()`/`createButton()` option objects (including nested under `attr: {...}`), the `name`
key of `this.addCommand({...})` (command-palette entries), and `.innerHTML = ...` assignments.

**`innerHTML`.** Assignments to `.innerHTML` are checked with HTML tags stripped out first — the
plugin builds several toolbar icons as raw SVG markup strings (`btn.innerHTML = '<svg
width="18"...'`), and without stripping tags, words like "svg", "width", "viewBox" inside the
attribute soup would all read as "prose" and flood the audit with icon markup. Stripping `<[^>]*>`
before the prose check means only text that would actually render between tags — e.g. a
`<span>Hardcoded Label</span>` sneaking into a template literal — gets flagged.

It parses each file with the TypeScript compiler API rather than grepping, so it understands the
actual AST (a string literal argument to `.setName()`, not just any string near the word "setName").
Anything not in the sink list above — `addDebugEntry()` calls, `console.*`, command IDs, CSS class
names — is never inspected, matching [What stays hardcoded](#what-stays-hardcoded) below with no
extra exclusion list to maintain.

**Local relay functions.** A file that repeatedly builds similar UI (a stats panel with several
rows, an export dialog with several radio options) often factors that out into a small local
helper — e.g. `const addRow = (label: string, value: string) => { row.createSpan({ text: label
}); ... }` — and calls it with a hardcoded label at each call site (`addRow('Location', ...)`).
The literal never touches a sink directly; it's the helper's *parameter* that does, one call frame
away. The checker detects this specific shape: for every local function or arrow function
(module- or method-scoped, invoked by bare identifier — not `this.foo()`), it checks whether a
parameter is forwarded into one of the sinks above anywhere in the function body. If so, every
call site's argument in that parameter position is checked for a hardcoded string, same as a
direct sink argument would be. This is *not* general data-flow analysis — a parameter that's
concatenated, template-interpolated (`` `${label}` ``), or routed through a second helper before
reaching a sink won't be traced. It catches the one-hop "wrapper around a sink" pattern (a stats
panel's row labels, say), without attempting to catch every possible indirection.

**Baseline.** The audit doesn't require the codebase to be violation-free before it can run: existing
violations are snapshotted in `scripts/i18n-audit-baseline.json`, and the check only fails on
violations *not* already in that file — so it blocks new hardcoded strings without gating on
cleaning up old ones. Run `pnpm lint:i18n --update-baseline` to regenerate the snapshot when
something is intentionally grandfathered instead of using an inline suppression comment. Every run
reports both the new-violation count and the grandfathered count, so the grandfathered total stays
visible.

**Suppressing a specific line.** Add a comment on the line above, matching this repo's existing
`// eslint-disable-next-line <rule> -- <reason>` convention:

```typescript
// i18n-audit-disable-next-line -- internal-only sample text, not user-facing UI copy
preview.textContent = 'It was the best of times, it was the worst of times…';
```

---

## What stays hardcoded

Strings that must not be run through `t()`:

| String | Reason |
|---|---|
| Command IDs (`orbis-search`, etc.) | Stable identifiers; Obsidian stores them in hotkeys.json |
| localStorage keys (`orbis-device-id`, etc.) | Data keys; changing them would lose user data |
| CSS class names | Internal |
| `console.log` / `console.warn` messages | Developer-facing |
| Debug panel log entries | Developer-facing |

---

## Build impact

esbuild bundles all locale files at build time — there is no lazy loading. The total size impact is proportional to the number of strings × number of languages. At ~200 strings per language and ~6 initial languages, this adds roughly 15–20 KB minified to the bundle, which is acceptable.

The `require('./${lang}')` pattern inside `initI18n` is a dynamic require that esbuild resolves at bundle time by statically analyzing the directory — all `.ts` files in `src/i18n/` matching the pattern are bundled. This means adding a new locale file requires a rebuild, but no code change.

---

## Contribution workflow

To add a new language:

1. Copy `src/i18n/en.ts` to `src/i18n/<lang>.ts` (use the two-letter ISO 639-1 code)
2. Change the variable name and export to match the lang code
3. Change the type annotation to `Partial<Translations>`
4. Translate the values; leave any untranslated keys absent (English fallback will cover them)
5. Run `pnpm build` — the TypeScript compiler will error on any key that no longer exists in `en.ts`
6. Submit a PR with the new locale file only; no plugin logic changes are needed

When new keys are added to `en.ts` in future releases, existing locale files remain valid (partial) — translators can add the missing keys in follow-up PRs without blocking the release.

---

## Initial language targets

Based on Obsidian community demographics:

| Language | Code | Priority |
|---|---|---|
| English | `en` | Base (required) |
| Simplified Chinese | `zh` | High |
| German | `de` | High |
| French | `fr` | Medium |
| Japanese | `ja` | Medium |
| Spanish | `es` | Medium |

The first release ships with `en` only. Remaining languages are added by community contributors after the framework is in place.
