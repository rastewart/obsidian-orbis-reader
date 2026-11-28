# Data Migration Guide

← [Design Docs](README.md)

Best practices for writing reliable one-time data migrations in an Obsidian plugin. Apply these patterns whenever a release changes the name, location, or format of vault files or plugin settings.

---

## When to write a migration

A migration is needed when a new version of the plugin expects data in a different shape or location than the previous version produced. Common cases:

- A vault folder or file is renamed
- A file extension changes
- A settings field is renamed, removed, or its type changes
- Data that was stored in `data.json` moves to vault files, or vice versa

For **schema changes within a file** (e.g. a new optional field with a safe default), no migration code is needed — just read defensively and fall back to the default.

---

## Schema version fields

Every generated artifact carries a `version: number` (or `settingsVersion` for `data.json`), stamped on every write. The constant is the source of truth for the current value — the table below just points at it; see "Version history" further down for what each bump meant.

| Artifact | Constant | Where |
|---|---|---|
| `.orbis` (`bookmarks`/`highlights`/`notes`/`notesFiles`/`readingStats`, plus the cached book metadata `title`/`author`/`coverImage`/`toc`) | `ORBIS_FILE_VERSION` | `src/progress.ts`, stamped by the shared `writeOrbisFile()` helper |
| `.location.<deviceId>.json` | `DEVICE_LOCATION_FILE_VERSION` | `src/progress.ts` |
| `.pages.json` (`LocationsCache`) | `LOCS_CACHE_VERSION` | `src/progress.ts` |
| `data.json` (`OrbisPluginSettings`) | `CURRENT_SETTINGS_VERSION` | `src/settings.ts` |

**Why, given the "read defensively" rule above still holds**: versioning and defensive reads solve different problems. Defensive reads handle additive changes (a new optional field) with zero migration code — that's still the right call for most schema changes, and adding a version field doesn't replace it. A version number earns its keep for changes too structural for a `typeof`/`Array.isArray` check to safely paper over — a field whose meaning changed, a value that needs recomputing from context the reader doesn't have (e.g. `chapterHref`, which can only be derived while the book is open), or anything where "silently keep going with best-effort data" is the wrong default. Knowing a file's version lets a migration make that call deliberately instead of every reader guessing forever.

**Convention:**

- The constant lives next to the read/write functions for that artifact, not in a shared "versions" file — keeps the bump next to the code it affects.
- Every write path stamps the *current* constant, unconditionally. Old files simply have no `version` field (or an older number); nothing needs to special-case that until a real migration is written.
- A read path only needs to check the version if it's about to make a decision that depends on it (e.g. reject a stale cache format). Until there's an actual breaking change, the field can sit unread — it costs nothing to have it there ahead of time, and it turns "figure out what shape this file might be" into "read one number" when that day comes.
- Bump the constant, add a migration keyed off `data.version < N` (see the guard pattern below — same idea, just keyed by a number instead of a boolean), and write the migration where the artifact is read (per-book, on open) rather than as a blind vault-wide startup pass, if the migration needs context only available then (e.g. the book's TOC).

The read-side check and the write stamp use the same constant, as in the table above. If they drift apart — the writer bumped, the reader not — every load silently forces a full cache rebuild.

## What travels between devices

Relevant whenever a new setting is added: decide up front whether it is **portable** or
**device-scoped**, because the storage location is the decision.

| Location | Travels with | Use for |
|---|---|---|
| `data.json` (`OrbisPluginSettings`) | plugin-settings sync, if the user has it | portable settings |
| `app.saveLocalStorage` | nothing — vault-scoped, per device | display prefs, recording gen-config, per-device UI state |
| a vault file | ordinary vault sync | data the user edits on whichever device is to hand |

Two established patterns keep device-specific values safe inside the *portable* file, so `data.json`
can be synced wholesale:

- **Key by `deviceId`.** `voicePrefs` is an array with one entry per device; each device reads only
  its own. Display styles do the same via an optional `deviceId` tag on auto-created device defaults.
- **Move it out entirely.** Font size, brightness, theme, margins, line height, flow, columns and the
  whole recording gen-config live in `localStorage`, which is explicitly not synced.

`ttsServerUrl` / `ttsServerVoice` / `ttsGenConcurrency` stay in `data.json` only as seed values —
`seedGenConfigFromLegacy()` reads them once to seed the per-device `localStorage` values. They are
deliberately not deleted, since deleting them would race across synced devices.

### The whole-object-write hazard

`saveData()` writes the **entire** in-memory settings object, so a device holding a stale copy
silently discards another device's changes with no conflict marker — the worst kind of failure,
because nothing surfaces it.

Obsidian's `onExternalSettingsChange()` hook (implemented in `main.ts`) normally prevents this: it
fires when `data.json` changes externally, and the plugin reloads settings and refreshes views.
Anything *derived* from settings must be invalidated there too — the compiled pronunciation
glossary, for one; otherwise a synced respelling does nothing until an unrelated local save clears
the cache.

For the remaining window (a change landing between the hook and a local write, or two devices editing
at once), `saveSettings()` fingerprints `data.json` before writing and offers reload-vs-overwrite.
Details worth preserving:

- The fingerprint is **canonical JSON with object keys sorted**, so two devices writing the same
  settings in a different key order isn't read as a foreign edit. Arrays keep their order, because
  reordering lookup sections *is* a real change.
- It is taken from **what actually landed on disk**, not what we meant to write — otherwise JSON
  dropping `undefined` fields makes our own write look foreign on the next save.
- Saves are **serialized**: the check is read-then-write, which two concurrent callers could interleave.
- Dismissing the prompt keeps the *other* device's copy. Losing one local edit is recoverable by
  redoing it; clobbering another device's settings is silent and of unknown extent.
- The guard arms only after `onload`, since migrations legitimately save during load.

An automatic merge is **not** possible here without per-key change tracking: a merge can't distinguish
"this device didn't touch `noteStyles`" from "this device intentionally deleted a note style", so it
would resurrect deletions.

---

### Version history

Every bump gets a row here, for every artifact, added in the same change that bumps the constant. This is a record of *why* a file's version is what it is — for the plugin's own user-facing release history (what shipped in which version of Orbis Reader itself), see `CHANGELOG.md` instead; the two are unrelated numbering schemes that happen to both be called "version."

| Artifact | Version | What / why |
|---|---|---|
| `ORBIS_FILE_VERSION` | 1 | Baseline. |
| `DEVICE_LOCATION_FILE_VERSION` | 1 | Baseline. |
| `LOCS_CACHE_VERSION` | 1 | Baseline. |
| `LOCS_CACHE_VERSION` | 2 | Adds `sectionHeadings`. A cache without them would keep guessed chapter names, so it is dropped and the next open measures headings alongside the word counts. |
| `LOCS_CACHE_VERSION` | 3 | Adds `anchorCharOffsets`. Without them a book whose contents anchor several chapters inside one file cannot size those chapters. |
| `LOCS_CACHE_VERSION` | 4 | One location numbering (`locAtChar`): each location's start is where its own text begins, no longer pulled forward to the next section's start, and `sectionLocInfo` counts the locations that start in a section. A cache from 3 would restore the old ranges. |
| `LOCS_CACHE_VERSION` | 5 | `anchorCharOffsets` also holds the contents entries only foliate can place (Kindle `kindle:pos:`, MOBI `filepos:`), so chapter locations on those books count from where each chapter begins. A cache from 4 has none of them. |
| `LOCS_CACHE_VERSION` | 6 | Adds `tocAnchorIds`, the id each of those entries points at, so every chapter split cuts a Kindle chapter where it starts. A cache from 5 has none of them. |
| `LOCS_CACHE_VERSION` | 7 | A cache built before the reader had its contents list measured no chapter starts — the build begins on the first page, which came first. The list now comes before the page; this drops every cache built in that race. |
| `LOCS_CACHE_VERSION` | 8 | `sectionHeadings` names a book's first page "Cover" when it holds only a picture, as an old MOBI's cover page does. |
| `LOCS_CACHE_VERSION` | 9 | Adds `pages`, a printed edition's page numbers, each where its text starts ([Page Numbers](page-numbers.md)). Written on every build, empty for a book without them, so a cache from 8 cannot say whether a book has page numbers. |
| `CURRENT_SETTINGS_VERSION` | 1 | Baseline. |

---

## Migration guard

Every migration must run exactly once. Store a boolean flag in `data.json` (via `OrbisPluginSettings`) and check it at the top of the migration function:

```typescript
private async migrateXxx(): Promise<void> {
  if (this.settings.xxxMigrated) return;
  // ... do work ...
  this.settings.xxxMigrated = true;
  await this.saveSettings();
}
```

**Set the flag after all work is done**, not partway through. If the flag is set early and the migration crashes or exits prematurely, it will never run again and the vault is left in an inconsistent state.

**Idempotency**: design the migration so that re-running it (with the flag cleared) is a no-op. The cleanest way is to check whether the source already exists before each operation — if the source is gone, the work was already done.

If a user ends up in a broken intermediate state and needs to retry, the recovery path is: open `data.json` in the plugin folder and delete the flag field. Document this in the user guide for any migration that could fail.

---

## When to trigger the migration

Register migrations in `onload()`, deferred to `app.workspace.onLayoutReady()`:

```typescript
async onload() {
  await this.loadSettings();
  // ... register views, commands, event handlers ...
  this.app.workspace.onLayoutReady(() => { void this.migrateXxx(); });
}
```

**Important:** `onLayoutReady` fires *after* the workspace is fully restored, which means views that were open in the previous session will have already loaded and may have already written new-format files to the vault. Migrations must handle this correctly (see "Handling a partially-created destination" below).

Do not trigger migrations before `onLayoutReady`. Vault state is not fully settled before that point, and heavy I/O during plugin load slows startup.

---

## Finding migration targets

### Do not use `getAllLoadedFiles()` or TFolder lookup

Obsidian's metadata cache is markdown-centric. Folders that contain only unregistered file types (`.json`, custom extensions) may not appear as `TFolder` instances in `getAllLoadedFiles()`. Relying on this for migration target discovery is unreliable.

### Use known vault files as anchors

Derive migration target paths from files the plugin already knows about — in this plugin's case, ebook files — and check the filesystem directly:

```typescript
const ebookFiles = this.app.vault.getFiles().filter(
  f => SUPPORTED_EXTENSIONS.includes(f.extension)
);
const parentPaths = new Set(ebookFiles.map(f => {
  const p = f.parent?.path;
  return (!p || p === '/') ? '' : p;
}));
parentPaths.add(''); // always check vault root

for (const parentPath of parentPaths) {
  const sourcePath = parentPath ? `${parentPath}/old-name` : 'old-name';
  if (!(await this.app.vault.adapter.exists(sourcePath))) continue;
  // ... migrate this location
}
```

`vault.getFiles()` returns all `TFile` instances regardless of extension, making it a reliable anchor for locating sibling folders.

### Use `adapter.exists()` for all existence checks

Check the filesystem, not the metadata cache:

```typescript
if (!(await this.app.vault.adapter.exists(path))) return;
```

---

## Handling a partially-created destination

Because `onLayoutReady` fires after views have loaded, the migration's destination may already exist by the time the migration runs (created by normal plugin operation during workspace restore). **Never treat an existing destination as evidence that migration is complete.** Treat it as a partial migration and merge:

```typescript
if (await this.app.vault.adapter.exists(destPath)) {
  // Destination exists — merge remaining source files into it.
  const listed = await this.app.vault.adapter.list(sourcePath);
  for (const fp of listed.files) {
    const name = fp.split('/').pop() ?? '';
    const dest = `${destPath}/${name}`;
    if (await this.app.vault.adapter.exists(dest)) {
      // Destination already has this file (newer copy written by normal operation).
      // Discard the old source copy.
      await this.app.vault.adapter.remove(fp);
    } else {
      await this.app.vault.adapter.rename(fp, dest);
    }
  }
  await this.app.vault.adapter.rmdir(sourcePath, true);
} else {
  // Clean rename.
  await this.app.vault.adapter.rename(sourcePath, destPath);
}
```

When the destination has the same file as the source, the destination copy wins — it was written by the current version of the plugin and is the correct format.

---

## Error handling

Wrap each independent unit of work (each folder, each file) in its own `try/catch` so that a failure on one item does not abort the rest:

```typescript
for (const path of targets) {
  try {
    // ... migrate path ...
    migrated++;
  } catch (e) {
    console.warn('Orbis: migration error for', path, e);
    new Notice(`Orbis: could not migrate ${path} — see console for details.`);
  }
}
```

Set the migration guard after the loop regardless of partial failures. Successfully migrated items are done; the ones that failed will have their source still present, so a future re-run (with the guard cleared) can retry them.

---

## Filesystem API reference

Use `vault.adapter` methods for all operations on files with **unregistered** extensions. These bypass the metadata cache, which is appropriate for files Obsidian does not index.

| Operation | Method |
|---|---|
| Check existence | `vault.adapter.exists(path)` |
| Read content | `vault.adapter.read(path)` |
| Write content | `vault.adapter.write(path, content)` |
| Rename / move | `vault.adapter.rename(oldPath, newPath)` |
| Delete a file | `vault.adapter.remove(path)` |
| List a folder | `vault.adapter.list(path)` → `{ files, folders }` |
| Create a folder | `vault.adapter.mkdir(path)` |
| Remove a folder | `vault.adapter.rmdir(path, recursive)` |

For files with **registered** extensions (`.md`, `.orbis`), prefer the high-level `vault.rename()` and `vault.delete()` so Obsidian keeps its link resolution cache consistent.

---

## Migration checklist

- [ ] If the artifact's schema change is breaking (not just an additive optional field), its version constant is bumped and both the read-side check and write-side stamp use the same constant (see "Schema version fields" above)
- [ ] A row added to "Version history" in the same change, recording what the bump was for
- [ ] Guard flag defined in `OrbisPluginSettings` as optional boolean; default is `undefined` (falsy)
- [ ] Guard checked at the very top of the migration function — return immediately if set
- [ ] Guard written **after** the migration loop completes, not inside it
- [ ] Targets derived from known vault files + `adapter.exists()`, not from `getAllLoadedFiles()`
- [ ] Partial / pre-existing destination handled with merge logic, not skipped
- [ ] Each target wrapped in `try/catch`; failures logged and shown in a `Notice`
- [ ] Migration is idempotent: re-running with guard cleared is a no-op
- [ ] User guide documents how to clear the guard flag to force a retry
- [ ] A one-time migration gets a "remove before 1.0" item under [Ongoing](roadmap.md#ongoing) in the roadmap
