# Notes Export System

← [Design Docs](README.md)

## Overview

The Notes Export system generates companion Markdown files from a book's bookmarks, highlights, and notes. **Note Styles** are named, reusable configurations stored in plugin settings. The **Generate Notes dialog** (`GenerateNotesModal`) lets the user control what goes into each file. Two output modes are supported: a single file for the whole book, and per-chapter mode (one file per TOC entry plus a MOC).

The markdown-building logic lives in the pure module `src/reader/export-format.ts` (`buildDeepLink`, `sortByLoc`, frontmatter/bucket assembly — covered by `export-format.test.ts`), driven by the `NotesExporter` collaborator (`src/reader/NotesExporter.ts`) for file I/O and the `ClipboardExporter` collaborator for copy commands. The view keeps only the modal launchers (`generateCompanionNotes`, `openOrCreateNotesFile`). Merge/diff UI stays in `src/NotesDiffModal.ts`.

---

## Note Styles

**Called "Notes styles" in the UI**, and "Notes style" on the Generate notes dialog's own selector. The code keeps
`NoteStyle` / `noteStyles`, and this document keeps the short name for the concept — but a reader never sees the word
"style" without "notes" beside it, because these configurations do not style anything: they define the format, the
location, the file name and the frontmatter of a generated file. "Style" also names display styles and marks'
appearance, and naming the object — the notes — separates the three. Not "annotation export style": a notes style
can outline the whole book with nothing marked. And not the singular "note style", which beside the marks manager
reads as how the notes attached to passages look; the plural is the commands' own word — Generate notes, Open
notes.

### Data model

```typescript
interface NoteStyle {
  id:          string;
  name:        string;
  isDefault:   boolean;    // at most one style; dialog pre-selects it
  createdAt:   number;
  config: {
    // File location
    useSameFolder:          boolean;
    notePath:               string;

    // Templates
    fileNameTemplate:       string;     // single-file mode: '{{title}} Notes'
    frontmatterTemplate:    string;
    folderNameTemplate:     string;     // per-chapter mode: '{{title}} Notes'
    chapterFileTemplate:    string;     // per-chapter mode: '{{index}} - {{chapter}}'

    // Content (single-file mode)
    includeChapterHeadings: boolean;
    chapterScope:           'all' | 'with-content';
    includeBookmarks:       boolean;
    includeHighlights:      boolean;
    includeNotes:           boolean;
    showHighlightColors:    boolean;
    sectionOrder:           NotesSectionId[];   // ['bookmarks','highlights','notes']

    // Per-chapter mode
    perChapter:             boolean;            // default: false
    chapterFilesScope:      'all' | 'with-content';
  };
}
```

`chapterScope` controls single-file mode (whether to emit chapter headings for chapters with no content). `chapterFilesScope` controls per-chapter mode (whether to generate a file for every TOC entry or only those with annotations). Both default to `'all'`.

### Storage and initialization

All Note Styles live in `OrbisPluginSettings.noteStyles[]` — synced via `plugin.saveData()`. There is no "active" style in localStorage; generation is one-shot.

On first load when `noteStyles` is empty, `OrbisReaderPlugin.initializeDefaultNoteStyle()` constructs a "Default" style from `DEFAULT_NOTE_STYLE_CONFIG`.

### Template tokens

**File / folder name templates** (`FILE_NAME_VARIABLES`, `FOLDER_NAME_VARIABLES`):
`{{title}}`, `{{author}}`, `{{filename}}`, `{{style}}`, `{{today}}`

**Chapter file template** (`CHAPTER_FILE_VARIABLES`):
`{{index}}` (zero-padded to 3 digits), `{{chapter}}`, `{{title}}`, `{{style}}`

**Frontmatter template** (`FRONTMATTER_VARIABLES`):
`{{title}}`, `{{author}}`, `{{publisher}}`, `{{publication_date}}`, `{{language}}`, `{{description}}`, `{{filename}}`, `{{book_link}}`, `{{today}}`

---

## Output modes

| | Single-file | Per-chapter | Reading records (separate system) |
|---|---|---|---|
| Output | One `.md` file | One `.md` per chapter + MOC | One `.md` per annotation + `.base` views |
| Reading it | A document | A document per chapter | A database |
| Location | `notePath / fileNameTemplate.md` | `notePath / folderNameTemplate / chapterFileTemplate.md` | Its own root folder, not `notePath` |
| File-exists handling | Merge (default), Replace, Save as new version | Same — applied to folder | None needed; the marker splits derived from reader-owned |
| Tracking | `NotesFileSet` with `mode: 'single'` | `NotesFileSet` with `mode: 'per-chapter'` | The files themselves, keyed by `orbis_id` |

The first two produce something you **read** — chapter headings, quoted passages, publishable as-is. The third
produces something you **query**. Both are wanted, by the same person at different moments, so records sit beside
the prose modes rather than replacing them, and the line templates serve only the prose modes.

---

## Per-annotation records → see [Reading Records](reading-records.md)

Per-annotation records are **a separate capability**, not a mode of this one: this system produces documents you
read, on demand, for one book; that one produces a queryable database, continuously, for every book. They share
`buildDeepLink()` and the annotation data, and nothing else — no merge modes, no file-set tracking, no line
templates. Everything else — the frontmatter schema, the filesystem layout, the generated views, the Bases syntax,
live export — lives in [reading-records.md](reading-records.md).

**`sortByLoc()` sorts by `loc` then `createdAt` (`export-format.ts`), and both can tie.** A location spans many
paragraphs, so several highlights in one chapter often share one, and `createdAt` is reading order only if the
reader never went back to mark an earlier passage — so a chapter's first sentence can appear fourth.
`cfiSortKey()` in `reader/cfi-sort.ts` gives true reading order and already orders records; using it here changes
existing generated notes, so it is a change of its own.

---

## Single-file output format

### With content selected

```markdown
---
<frontmatter>
---

# Book Title

## Contents

- [[#Chapter One]]
- [[#Chapter Two]]

---

## Chapter One

[↗ Open in book](obsidian://orbis-nav?...&href=...)

### Bookmarks

- [loc. 12](obsidian://orbis-nav?...)

### Passage selections

- 🟡 "Quoted text" — [loc. 14](obsidian://orbis-nav?...)

### Notes

> "Selected text"

Note text — [loc. 15](obsidian://orbis-nav?...)

## Chapter Two
...
```

**The jump back into the book sits under each heading, never in it.** Obsidian matches a `[[#…]]` link against a
heading's source text, so a heading holding `[↗](obsidian://…)` would match no link, its own Contents entry included.
A Contents target goes through `headingLinkTarget` (Obsidian's `stripHeadingForLink`), so a `|` or `#` in a
chapter's name cannot turn the rest into an alias or a second heading.

### Chapter headings only

```markdown
---
<frontmatter>
---

# Book Title

## Chapter One

## Chapter Two
```

No Contents TOC or annotation sections — just a scaffold the user fills in manually.

**The Contents finds each chapter after the note is written** (`reader/contents-links.ts`). The kind headings repeat
in every chapter, so a chapter called Notes comes after a chapter's own Notes section, and `[[#Notes]]` goes to the
section. No heading path reaches it either: Obsidian's path takes the first DEEPER heading after its first part, and
the section is deeper than the chapter. So each chapter heading carries a marker while the note is built, and
`resolveChapterWikiLinks` reads them off in order: a heading that is the first of its name is linked by name, and one
that is not puts a block id on its ↗ Open in book line, `^orbis-chapter-N`, for the Contents to link to.

### Out of the vault

**Export…** on a computer and **Share…** on a phone or tablet send the single note out of the vault instead
(`GenerateNotesModal.exportOutside`); a book folder is a set and stays. Everything that ties the note to the vault is
written another way, by `buildNotesMarkdown(…, portable)` and `reader/portable-markdown.ts`: a link into the book
(`{{link}}`) is its location as text, since `obsidian://orbis-nav` opens only this vault; the **↗ Open in book** line
goes; `{{book_link}}` is the book's file name in plain text, so the properties stay and still say which book; a link
to another note in what the reader typed becomes its words, and an embed goes, as images do from every exported copy.

**The Contents links to the anchors GitHub gives the finished note.** An anchor depends on every heading above it —
GitHub names the first `notes` and the next `notes-1` — and the kind headings repeat in every chapter, so a chapter
called Notes comes after one. The chapter headings carry a marker while the note is built, and `resolveChapterAnchors`
reads them off in order, numbering repeats, before any link is written — the same pass the vault note's
Contents uses, above. Merge, Save as new version, Replace and the
replace warning are about a note in the vault, so none applies, and nothing is recorded as a notes set.

---

## Per-chapter output format

### Chapter file structure

```markdown
---
chapter: 5
title: "Chapter 3: A Sample Title"
book: "[[My Book]]"
note_set: "library-epub-my-book-notes"
has_bookmarks: false
has_passage_selections: true
has_notes: false
prev: "[[004 - Chapter 2]]"
next: "[[006 - Chapter 4]]"
open_chapter: "obsidian://orbis-nav?file=...&href=text/part0007.html"
---

# Chapter 3: A Sample Title

[↗ Open in book](obsidian://orbis-nav?...&href=text/part0007.html)

## Passage selections

- 🟡 "The lamps along the quay were lit early…" — [loc. 40](obsidian://orbis-nav?...)
```

#### Frontmatter fields

| Field | Type | Notes |
|---|---|---|
| `chapter` | number | 1-based index in the generated file list |
| `title` | string | Chapter label from TOC |
| `book` | wikilink | Points to the epub file |
| `note_set` | string | Stable slug — used as the Obsidian Base filter value |
| `has_bookmarks` | boolean | True if any bookmarks were generated |
| `has_passage_selections` | boolean | True if any passage selections were generated |
| `has_notes` | boolean | True if any notes were generated |
| `prev` | wikilink or omitted | Previous chapter in the generated list |
| `next` | wikilink or omitted | Next chapter in the generated list |
| `open_chapter` | URL | `obsidian://orbis-nav?...&href=...` — jumps to this chapter in the reader |

`prev`/`next` are computed from the *generated* file list, not the full TOC. In content-only mode, they skip chapters that have no file.

#### System-controlled keys

These are always written by the generator. Any matching keys in the user's frontmatter template are stripped before appending to prevent duplicate YAML:

```
chapter, title, book, note_set,
has_bookmarks, has_passage_selections, has_notes,
prev, next, open_chapter
```

### MOC file

Placed inside the chapter folder as `000 - {BookTitle}.md`:

```
{notesParentFolder}/{folderName}/
  000 - Book Title.md     ← MOC
  001 - Introduction.md
  002 - Chapter One.md
  …
```

The MOC contains an embedded Obsidian Base block that auto-filters by `note_set` slug, showing a table with chapter number, file link, and `has_*` flags. The Base filter uses `==` (strict equality, not `contains`) to avoid cross-contamination between `Notes` and `Notes-2` slugs. The MOC carries the set's `note_set` too, so a Replace knows it as the set's own (see [Conflict resolution](#conflict-resolution)); a second filter, `file.path != this.file.path`, keeps it out of its own table.

#### `note_set` slug

```typescript
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const noteSetSlug = slugify(folderPath);
```

Derived from the full vault folder path (e.g. `Library/epub/My Book Notes` → `library-epub-my-book-notes`). Full-path slugs are always unique even when two folders share the same name in different directories.

### File naming and collision handling

`resolveFolderName` / `resolveChapterFileName` sanitize by replacing `[\\/:*?"<>|#^[\]]` with `-`, collapsing runs, and trimming. If two TOC entries resolve to the same chapter filename, subsequent ones are auto-suffixed with `-2`, `-3`, etc. The default template `{{index}} - {{chapter}}` is always collision-safe.

`findUnusedPath` / `findUnusedFolderBase` return the base path unchanged if it is free; only append a numeric suffix on an actual collision.

---

## Notes file tracking

Generated files are tracked in `NotesFileSet` records stored under the `notesFiles` key of the book's progress JSON:

```typescript
interface NotesFileChapter {
  chapter:      number;   // 1-based index
  title:        string;   // TOC label
  sectionIndex: number;   // spine index for position matching
  path:         string;   // vault path
}

interface NotesFileSet {
  id:           string;
  styleName:    string;   // shown in picker
  styleId:      string;   // stable even after rename
  createdAt:    number;
  mode:         'single' | 'per-chapter';
  path?:        string;   // single-file mode
  folder?:      string;   // per-chapter mode
  mocPath?:     string;
  chapters?:    NotesFileChapter[];
  pendingReview?: boolean;
  compareWith?:   string;
}
```

Old `NotesFileRecord` objects (no `mode` field) are upgraded on read by `upgradeNotesRecord`.

A set is recorded in this device's file and rebuilt into the `.orbis` like a mark, so sets written on two devices while apart are both kept — see [Book annotation sync](book-annotation-sync.md#what-counts-as-a-change). `recordNotesFileSet` records the set as written, and a new set replaces any recorded at the same file or folder. **Open notes** hides a set whose files are missing and never deletes it, since the files may only not have arrived yet.

---

## Conflict resolution

When a file or folder already exists at the target path, the Generate dialog offers three actions. **Merge is the default.**

| Action | Single-file | Per-chapter |
|---|---|---|
| **Merge** *(default)* | Generate to `{name}-merge-draft.md`, open `FileDiffModal` | Generate to `{folder}-merge-draft/`, open `PerChapterMergeModal` |
| **Save as new version** | Write to `{name}-1.md` (first unused) | Write to `{folder}-1/` (first unused) |
| **Replace** | Overwrite existing file | Overwrite this set's chapter notes; trash the set's notes this run does not write |

Replace in per-chapter mode: before writing, `earlierSetNotes` picks the folder's notes that an earlier run of this set wrote — `orbis_generated: note-set`, this set's `note_set`, and a `book` that resolves to this book. After writing, those this run did not write again go to the trash (`trashFile`, so Obsidian's *Deleted files* setting decides where). Replace means this run's notes are the whole set: chapter files are numbered in the order they are written, so a chapter dropped or picked out renumbers the rest, and an earlier run's notes left behind would be listed twice in the contents note's Base. Anything else in the folder — the reader's notes, Save as Markdown's, another book's set — is left alone.

The match is limited to the destination folder, never the vault: a merge draft is written to `{folder}-merge-draft/` with the SAME `note_set`, so a vault-wide match would take the draft for the set's leftovers or the set for the draft's.

The draft file/folder is the only state indicator — no extra tracking needed. If Obsidian is closed mid-merge, the draft persists. When the Generate dialog is opened and a `-merge-draft` file/folder exists at the target path, it offers Resume or Discard.

---

## Merge flow

### Single-file merge

1. Generate fresh content to `{name}-merge-draft.md`
2. If draft equals original → delete draft, show "Already up to date"
3. If different → open `FileDiffModal(originalPath, draftPath, onResolved)`
4. Apply: write merged result to original, trash draft, call `onResolved()`
5. Cancel: close, leave draft (resume later)

### Per-chapter merge

1. Generate fresh content to `{folder}-merge-draft/`
2. Open `PerChapterMergeModal(originalFolder, draftFolder)`
3. On open, auto-process all draft files:
   - New (not in original) → auto-copy to original, trash from draft — "Added"
   - Identical → trash from draft — "Up to date"
   - `000 ` prefix (MOC) → overwrite original MOC, trash draft — "Updated index"
   - Differs → queue for review
4. If none need review → complete and close
5. Otherwise → show list with [Review] button per changed file
6. Each [Review] → opens `FileDiffModal` for that pair; Apply resolves that file
7. When no draft files remain → trash draft folder, show "Merge complete", close

---

## FileDiffModal (`src/NotesDiffModal.ts`)

Uses `diffLines()` from the `diff` package (MIT, ~15 KB). Each contiguous block of changed lines is one hunk in a scrollable panel. Removed lines show red (`-`), added lines show green (`+`).

Navigation: Prev / Next buttons, "Change N of M" counter. Per-hunk decisions:
- **Keep original** — use the original lines for this hunk
- **Use generated** — use the draft lines

`computeResult()` reconstructs the full file at Apply time from hunk decisions. No editable textarea — the hunk decisions are the source of truth.

Apply: `computeResult()` → write to original file → trash draft → call `onResolved()` callback → close.  
Cancel: close, leave draft.

---

## "Open notes" picker

`openOrCreateNotesFile()` shows `NotesFilePickerModal` with one entry per tracked file set. For per-chapter sets, the entry opens the **current chapter file** (matched by `currentTocLabel`, with `sectionIndex` as fallback). The MOC is not shown in the picker.

Before showing, stale sets (whose file/folder no longer exists) are pruned and the updated list is saved.

---

## Generate Notes dialog (`GenerateNotesModal`)

Triggered by: command `orbis-generate-notes` or the `...` toolbar menu.

**Style selector** — dropdown, default style pre-selected.

**Content** (mode-dependent):
- Single-file: checkboxes for Chapter headings / Bookmarks / Highlights / Notes; chapter scope radio when any content is checked
- Per-chapter: checkboxes for Bookmarks / Highlights / Notes; "Generate chapter files for" radio (All / With content)

**Conflict section** (shown only when target exists):
- Merge (default) / Save as new version / Replace

---

## Settings — Notes styles (`OrbisSettings`)

Note Styles are managed under **Annotations → Notes styles**. Each style has:
- Name, Set as default toggle
- File location (same folder toggle + path)
- File name template (single-file) / Folder name template + Chapter file template (per-chapter). An emptied or blank
  template means the default one, which the field shows as its hint.
- Frontmatter template (textarea with variable chips + Reset button)
- Content checkboxes and section order (per mode)
- Per-chapter toggle and scope

---

## Commands

| Command ID | Name |
|---|---|
| `orbis-generate-notes` | Generate notes file… |
| `orbis-open-notes` | Open or create notes file |

---

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Output mode flag | `perChapter: boolean` on NoteStyle.config | Simplest; matches the toggle UI |
| Default chapter scope | `'all'` | Empty files are valid scaffolds; MOC is most useful when complete |
| `has_*` flags | Three separate booleans | `has_content` would need updates when user adds own text |
| MOC type | Embedded Obsidian Base | Auto-updating; degrades gracefully without Bases |
| MOC location | `000 - {Title}.md` inside the chapter folder | Visually first (alphabetical); stays with its files |
| Base filter operator | `==` (strict equality) | `contains` causes cross-contamination between `Notes` and `Notes-2` |
| `note_set` slug | `slugify(fullFolderPath)` | Full path guarantees uniqueness across directories |
| Conflict default | Merge | Non-destructive; guides review rather than accidentally destroying edits |
| Merge state tracking | `-merge-draft` file/folder presence | Draft presence IS the state; no separate JSON needed |
| New files in per-chapter merge | Auto-add silently | No original to conflict with |
| Identical files in merge | Auto-resolve silently | No user action needed |
| MOC in merge | Auto-update (identified by `000 ` prefix) | No user-editable content |
| Merged result | Computed from hunk decisions | Simple; no editable textarea |
| Diff library | `diff` npm package (MIT, ~15 KB) | Stable, no sub-dependencies |
| `prev`/`next` links | Computed from generated list | Content-only mode must skip non-generated chapters |
| Chapter index padding | 3 digits (001) | Alphabetical = reading order for up to 999 chapters |
| Presentation of grouped/sorted views | Obsidian Bases, not our code | Every reasonable regrouping request would otherwise be a release |
| `groupBy: 'mark'` in the prose exporter | Not offered | Bases makes it redundant, and takes its unanswerable cases with it |
