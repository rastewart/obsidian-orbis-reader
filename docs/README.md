# Orbis Reader — Documentation

## [User Guide](guide/README.md)

End-user documentation for installing and using Orbis Reader.

| Page | What it covers |
|---|---|
| [Getting Started](guide/getting-started.md) | Installation, setup and your first book |
| [Reading a Book](guide/reading-a-book.md) | The reader: the toolbar, moving around, the Navigator, images and Focus mode |
| [Listening](guide/listening.md) | Listening to a book: voices, the listening bar, the full-screen audio player, recordings and Pocket mode |
| [Marks and Notes](guide/marks-and-notes.md) | Passage selections, annotation notes, bookmarks and the Annotations tab |
| [Annotations and Presets](guide/annotations-and-presets.md) | Marks, annotation presets and the Marks manager |
| [Display Settings](guide/display-settings.md) | Fonts, reader themes, layout and display styles |
| [Exporting and Converting with Orbis Reader](guide/exporting-and-converting.md) | The six export and conversion features, and which one to use |
| [Generate Notes](guide/generate-notes.md) | Annotations as Obsidian notes: one note, or a book folder with a note per chapter |
| [Save Annotations as PDF](guide/save-annotations-as-pdf.md) | A PDF digest of a book's passage selections and notes |
| [Save as Markdown](guide/save-as-markdown.md) | A book's text as Markdown notes |
| [Save as PDF](guide/save-as-pdf.md) | A book as a PDF, with its marks |
| [Read in Orbis Reader](guide/read-in-orbis-reader.md) | A note converted into a book and opened in one step |
| [Notes to EPUB](guide/notes-to-epub.md) | Obsidian notes converted into EPUB books |
| [Reading Records](guide/reading-records.md) | A vault note for each annotation, kept up to date as you read |
| [Reading Progress](guide/reading-progress.md) | The progress indicator, locations and reading stats |
| [Sync and Devices](guide/sync-and-devices.md) | One vault on more than one device: reading locations and shared settings |
| [Look-up](guide/look-up.md) | Definitions, vault notes and web results for selected text |
| [Library Dashboards](guide/library-dashboards.md) | Title notes, cataloging, collections and dashboards |
| [Book Sources](guide/book-sources.md) | Browsing OPDS feeds and downloading books into your vault |
| [Search](guide/search.md) | Full-text search of a book and its annotations |
| [Troubleshooting](guide/troubleshooting.md) | Problems and their fixes |
| [Settings Reference](guide/settings-reference.md) | Every setting, page by page |
| [Command Reference](guide/command-reference.md) | Every command in the command palette, and hotkeys |
| [Deep Links](guide/deep-links.md) | Links that open a book at a location: copying them, opening them, and their format |
| [Format Support](guide/format-support.md) | What works with EPUB, MOBI, AZW3, FB2 and CBZ |
| [The .orbis File](guide/orbis-file.md) | The file that contains a book's annotations and reading stats, and the page that shows it |

---

## [Design Docs](design/README.md)

Internal developer documentation covering architecture and subsystem design.

| Document | Description |
|---|---|
| [Code Standards & Workflow](design/code-standards.md) | Build, deploy, lint, test, and Fallow analysis steps |
| [Feature Development Guide](design/feature-development-guide.md) | Checklist for adding enhancements and capabilities |
| [Architecture Extension Guide](design/architecture-extension-guide.md) | Adding reader features while preserving the collaborator / `ReaderContext` / host architecture |
| [Data Migration Guide](design/data-migration.md) | Best practices for reliable one-time vault and settings migrations |
| [Plugin Architecture](design/plugin-architecture.md) | Source layout, lifecycle, commands, file layout |
| [Toolbar & Content Panel](design/toolbar-and-panels.md) | Toolbar buttons, panel tabs |
| [Annotations](design/annotations.md) | Highlights, notes, bookmarks — data model and storage |
| [Listening (TTS & Recording)](design/text-to-speech.md) | Read-aloud engines (Web Speech + on-device Piper), voice picker, player, pacing, OS controls, and the recording generation MVP + roadmap |
| [Reading Progress & Sync](design/reading-progress-system.md) | Location files, pages cache, WPM, progress modes |
| [Display Styles](design/display-styles.md) | DisplayStyle data model, localStorage, style lifecycle |
| [Orbis Data View](design/orbis-data-view.md) | `.orbis` file format, `orbis-data/` folder, vault event handlers, custom view |
| [Notes Export](design/notes-export.md) | Note Styles, output formats, merge/diff flow |
| [Book Export](design/book-export.md) | epub→Markdown extraction, Turndown, image handling |
| [Debug System](design/debug-system.md) | Category-filtered debug log panel |
| [Integration Test Strategy](design/integration-test-strategy.md) | vitest, mock-vault pattern, CI |
| [Dependency Security](design/dependency-security.md) | Supply-chain audit |
| [Roadmap](design/roadmap.md) | Development phases and completion status |
