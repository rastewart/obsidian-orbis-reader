# Integration Test Strategy

← [Design Docs](README.md)

## Context

Obsidian plugins run inside Electron and depend on the Obsidian API (`App`, `Vault`, `TFile`, etc.). These dependencies are not available in a Node.js test environment, which means:

- **Unit tests** (pure functions with no Obsidian API calls) run with vitest + jsdom — see `src/__tests__/`.
- **Integration tests** (anything that touches `app.vault`, workspace, or settings persistence) require a different approach.
- **End-to-end tests** run the built plugin in a real Obsidian on your computer, with `pnpm e2e`. See [End-to-End Tests](end-to-end-tests.md).

CI runs the full vitest suite on every push via `.github/workflows/ci.yml` (`pnpm test`).

---

## What is unit-tested

The suites in `src/__tests__/` cover the pure modules, among them:

| File | Tested functions |
|---|---|
| `turndown-rules.ts` | `createTurndownService` — all custom rules, removed elements, heading/HR style |
| `settings.ts` | `buildBookCss`, `resolveHostBg`, `DEFAULT_PLUGIN_SETTINGS`, `DEFAULT_NOTE_STYLE_CONFIG` |
| `progress.ts` | `progressFolderPath`, `progressFilePath` (path helpers, no vault I/O) |
| `book-extractor.ts` | `sanitizeName`, `stripLeadingDuplicateTitle` |
| `display-commands.ts` | `stepLineHeight`, `stepFontSize`, `stepBrightness`, `stepMargins` — floating-point accumulation and boundary clamping |
| `export-format.ts` | `buildNotesMarkdown`, per-chapter assembly, frontmatter, chapter bucketing, clipboard formatting, `buildDeepLink`, reading order of marks |
| `cfi-sort.ts` | `cfiSortKey` (a position as a string that sorts in reading order), `inReadingOrder`, `markCfi` |
| `stats-math.ts` | chapter boundaries, section/chapter progress, WPM trimmed mean + sampling gate, words-in-range, loc-mode cycling, label/time formatting |
| `bookmark-utils.ts` | `findCurrentBookmark` (exactCfi/loc matching, stale-loc guard) |
| `panel-utils.ts` | `visibleTabIds` (visibility config, never-empty invariant) |
| `nav-suppressor.ts` | `NavSuppressor` state machine (mobile focusin suppression) |
| `search-utils.ts` | `sectionIndexFromCfi` |
| `goto-parser.ts` | Go-to input parsing (loc. number vs. percent) |
| `toc-utils.ts` | TOC flattening / anchor resolution |
| `build-info.ts` | `buildLabel` build-stamp formatting |
| `location-math.ts` | location index math, page/loc mapping |
| `range-utils.ts` | range tightening / comparison helpers |
| `page-follow.ts` | `anchorAtFraction` (1-char range at a fraction through a sentence), `pageTowardFraction` page math |
| `bookmark-controller.ts` | reading-bookmark creation/detection against a mocked vault |
| `dictionary-lookup.ts` | `lookupCandidates` (stemming / lookup order) |
| `gen-config.ts` | recording gen-config read/write, legacy seeding, method migration |
| `gen-timing.ts` | recording speed samples → time estimate |
| `recording-editions.ts` | editions index + mix pointer manifests, prune/assign helpers |
| `recorded-audio.ts` | `segmentIndexAt` (binary search on segment start), `segmentIndexForCfi` |
| `live-voice-picker.ts` | offered methods per platform (Web Speech present/absent), active-source resolution incl. the saved-'system'-without-Web-Speech fallback, `getVoice`/`setVoice` id#N splitting, per-model speaker memory |
| `tts-normalize.ts` | `normalizeForSpeech` — Roman numerals, ALL-CAPS handling, and glossary substitution ordering |
| `tts-words.ts` | `getWordUnits` (word ranges within a sentence, incl. mid-node starts and inline markup), `cumCharBounds`, `unitIndexAtFraction` |
| `speak-once.ts` | `clampSpeechText`, `asCompleteUtterance`, `prepareSpeechText` |
| `pronunciations.ts` | glossary matcher — whole-token boundaries, non-cascading substitution, longest-first, lowercasing |
| `reader/mark-draw.ts` | `mergeLineRects` — coalescing the multiple client rects WebKit reports for one line, without merging consecutive lines |
| `annotation-presets.ts` | preset/mark rules — `(color, treatment)` uniqueness, `firstFreeAppearance`, `moveMark` order preservation, `quickMarks`, `resolveMark` (markId then unique color), `emojiForColor`, `defaultBadge`/`badgeOf`, the seeded built-in preset, `bookPresetFrom` deep copy, `presetFromMarks` id preservation, canonical built-in ids, the read-only built-in, `duplicatePreset` id regeneration, `noteMark`/`audioMark` role resolution and their fallbacks, `migrateMark` legacy-shape conversion, the INK sentinel, the forward-only merge and survivor rule, `applyRemap` and `copyMarkLocally` |

The reader's intricate logic lives in these pure modules rather than inside `OrbisReaderView`, so it can be covered densely without Obsidian.

---

## Inline adapter mocks

Vault-I/O and extractor tests use **inline mocks in the test file** rather than a shared mock-vault helper, which is simpler for the small surface each suite touches:

- **`progress.test.ts`** builds a plain object `adapter` implementing `exists`/`read`/`write`/`list`/`mkdir` plus `vault.getFiles()`, and exercises the real vault I/O: `saveHighlights`/`writeOrbisFile`, `ensureOrbisFileExists`, `saveBookInfo`, `readNotes`, `readNotesFiles`.
- **`book-extractor.test.ts`** uses a `makeSection(html)` helper whose `createDocument()` returns a jsdom `Document`, and tests the section collectors (`collectByTocAnchors`, `collectBySectionFallback`) alongside the pure helpers.

The pattern for a new vault-touching suite: assemble a `Map`-backed `adapter`, cast `{ vault } as unknown as App`, and assert on what was written back into the map.

```typescript
const files = new Map<string, string>();
const adapter = {
  exists: async (p: string) => files.has(p),
  read: async (p: string) => files.get(p) ?? '',
  write: async (p: string, d: string) => void files.set(p, d),
  list: async (f: string) => ({ files: [...files.keys()].filter((p) => p.startsWith(f + '/')), folders: [] }),
  mkdir: async () => {},
};
```

`buildNotesMarkdown` lives in the pure module `src/reader/export-format.ts` and is unit-tested in `export-format.test.ts`; `generatePerChapterNotes` is in the `NotesExporter` collaborator.

---

## Test fixtures

Generated books are committed in `test-vault/fixtures/` across formats (epub, mobi, azw3, fb2, cbz), built by `pnpm build:fixtures` — see `test-vault/fixtures/README.md`. None ships reading data (`!orbis-data/` is not committed), so a manual step that needs some creates it first. vitest reads only their shapes, through `src/__tests__/fixtures/book-shapes.json`; the books themselves are for manual testing, and each [test plan](test-plans/README.md) page's Setup says what state it needs and makes it.

---

## Real Obsidian instance testing

For testing that requires the full Obsidian runtime (plugin loading, command palette, workspace layout), `pnpm e2e` runs the built plugin in a separate Obsidian on your computer and drives it over the Chrome DevTools Protocol, reaching into the book's frames from the page itself: see [End-to-End Tests](end-to-end-tests.md). Playwright + Electron is not used.

What only a device can show — touch, the phone and tablet engines, sync between real devices, and how a book reads — is covered by manual device tests, one page per system of Orbis, each tagged by the devices a step must run on: see [Test plans](test-plans/README.md).
