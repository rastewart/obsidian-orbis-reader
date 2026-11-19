# Orbis Reader — Roadmap

← [Design Docs](README.md)

**This is the one place status lives, and it lists open work only.** The design docs describe how each system works
and why it is shaped that way; none of them says whether it is built. When something ships, its entry comes off this
page in the same commit, and git history keeps the record. Anything not listed here is either done or has never been
proposed.

---

## What is open

Most of it gates the same thing — publication. [Obsidian compliance](obsidian-compliance-plan.md) holds the
per-requirement detail behind §5.

| | |
|---|---|
| **Blocking release** | Nothing: Orbis Reader is listed in the Community directory (2026-11-19). The announcement is left (§5.7) |
| **Documentation** | The end-user guide (§4) — every page exists; what is left is read-throughs, not gaps |
| **Development environment** | Two cross-platform items (§4b): the CLI reload off Windows, and CI on Ubuntu |
| **Not scheduled** | The [backlog](#backlog--ideas-unscheduled) |
| **Deferred by choice** | Translations (§6), and the deferrals kept under §8.1, §8.2, §8.4, §8.5 and §8.14 |
| **Standing** | Attribution as dependencies change, large-book profiling, foliate-js upstream, the quarterly dependency audit and the `onnxruntime-web` recheck (both due 2026-12), and removing the sidecar-name migration before 1.0 |

## Phase 4: Documentation

- [ ] **User guide** — every page in `docs/guide/` exists; read each one through against the product as it ships

---

## Phase 4b: Cross-platform development support

The core build toolchain (`pnpm`, `node`, `vitest`) is already cross-platform. The gaps are in the deploy script and CI verification.

- [ ] **Verify Obsidian CLI reload on non-Windows** — confirm the `obsidian://` URI reload works on macOS and Linux; document the manual fallback if not
- [ ] **CI on Ubuntu** — confirm the existing `ubuntu-latest` CI runner passes type-check, lint, test, and build cleanly (no Windows-specific assumptions in the workflow)
- [x] **Audit contributor docs** (2026-10-22) — `CONTRIBUTING.md` rewritten for pull requests by invitation only,
      with bug-report guidance and a cross-platform build section naming both deploy scripts and the whole gate. In
      `code-standards.md` every block that is the same on every platform is fenced `sh` — `pnpm`, the Obsidian CLI,
      and the failed-test one-liner, now Node rather than Python — and only `.\deploy.ps1` stays PowerShell, beside
      `./deploy.sh`. The watch-mode steps name both deploy scripts, and the live-sync section, which documented the
      personal, git-ignored `deploy-to-vault.bat` as if it shipped, says to copy a deploy script instead

---

## Phase 5: Pre-submission

Work required before submitting to the Obsidian community plugin directory. Items are ordered by dependency.

### 5.3 Mobile regression testing

Run the [test plans](test-plans/README.md) before submission, and the page for a system after any change to it.

- [x] Every page written and run on the devices its steps name — the Mac, Android, iPhone and iPad (2026-09-29 to
  2026-10-09)
- [x] Mobile limitations documented — no lock-screen controls and no playback with the screen off, in the
  [Listening guide](../guide/listening.md) (2026-10-10)
- [x] `isDesktopOnly` is `false`, and honest: every test page ran on Android, iPhone and iPad (2026-10-10)

### 5.4 Regression test pass

Several changes carry regression risk and should be explicitly validated before submission:

- [x] **StorageEvent → workspace event bus** — every display setting updating live in an open book: [Display](test-plans/display.md), *Each control, both ways* (run 2026-10).
- [x] **`activeWindow` migration** — the marks bar, the note editor and note icons in a book moved to a window of its own: [Marks and notes](test-plans/marks-and-notes.md), the `desktop` step at the end of *Notes* (run 2026-10-10). The run found the view header's ⋯ menu opening in the other window, since Obsidian never learned the book's window was active; fixed by `reader/frame-focus.ts`.
- [x] **String changes** — "Use new version" ([Annotation exports](test-plans/annotation-exports.md)), "Writing table of contents…" ([Conversions](test-plans/conversions.md)), "Average reading speed" ([The Orbis file and resilience](test-plans/orbis-file-and-resilience.md)) and "Placeholders:" (Annotation exports, run 2026-10-10) are all quoted by steps that passed.

Run the full smoke test in `docs/design/code-standards.md` plus the [test plans](test-plans/README.md)' release run.

### 5.6 Publication readiness

The per-requirement detail is in [Obsidian compliance](obsidian-compliance-plan.md); these are the items it holds
that nothing else on this page tracks.

- [x] **Large-vault testing** — a vault of about ten thousand files against a small one, on the Mac and Android, from
      timing lines in the debug log (2026-10-10). Nothing grows faster than the
      vault, and everything in the foreground stays under 100 ms on the Mac. The sync scan listed its folder once per
      type; it now looks once per scan and reads its files in batches. What remains is in *Ongoing*
- [x] **Screenshots in the README** — the reader on a computer, listening on a tablet and the audio player on a
      phone, with the overview picture (2026-10-22). Obsidian does not require screenshots; listing screenshots are
      optional and go in the listing editor at submission (§5.7), not the release assets — sizes in
      [Obsidian compliance §7.4](obsidian-compliance-plan.md#74-screenshots)
- [x] **`styles.css` in the release assets** — `release.yml` uploads it with `main.js` and `manifest.json`
      (2026-10-27)
- [x] **Document the version bump** — the release checklist in
      [Feature Development Guide](feature-development-guide.md): `pnpm bump <version>` changes the four files at
      once, and the release workflow refuses a tag they disagree with (2026-10-27)

### 5.7 Release and submission

Submission is through the Community directory at community.obsidian.md, not a pull request to
`obsidianmd/obsidian-releases`. Its review is automatic. The policies it holds Orbis to, and where Orbis stands on
each, are in [Obsidian compliance §8.5](obsidian-compliance-plan.md#85-developer-policies).

- [x] Release `0.1.0` from main, as *Publishing* in [Feature Development Guide](feature-development-guide.md) says,
      with **Set as the latest release** ticked (2026-11-18)
- [x] On community.obsidian.md, sign in with the Obsidian account, link the GitHub account (it proves the
      repository is ours), and add the plugin (2026-11-18)
- [x] Resolve every error the automated review reports (2026-11-19). The review of `0.1.0` reported 21 errors, all in
      vendored foliate-js, and `0.1.1` fixed them (foliate patches 31 to 35); the review of `0.1.1` reported 9 more,
      `style.x = ''`, and `0.1.2` fixed those (patch 36) and made the build reproducible. The review of `0.1.2` has no
      errors, and its build verification reproduced the release's `main.js` byte for byte. What is left are warnings,
      among them the desktop-only Node and Electron use: see
      [Obsidian compliance §8.3](obsidian-compliance-plan.md#83-submission-and-review)
- [x] Publish the entry in the directory (2026-11-19): <https://community.obsidian.md/plugins/orbis-reader>
- [ ] Optional: listing screenshots in the listing editor, sized as
      [Obsidian compliance §7.4](obsidian-compliance-plan.md#74-screenshots) says
- [x] Once listed: the README and Getting Started install from the community plugins first, and keep BRAT for betas
      (2026-11-19)
- [ ] Announce in the Obsidian forum (Share & Showcase) and on Discord (#updates)

### 5.8 Manifest & versioning

- [ ] Optional: `fundingUrl` in `manifest.json`, only if donations are to be accepted; the submission requirements
      say to leave it out otherwise (checked 2026-11-18)

---

## Phase 6: Additional languages

The i18n framework is in place ([Localization](localization.md)). This phase covers adding non-English locale files. The `src/i18n/en.ts` base locale and the contributor workflow in `CONTRIBUTING.md` serve as the foundation.

**Not scheduled, and possibly never.** Translating the UI is not a release priority and may not happen at all;
the framework exists so that it *can*, not because it is planned. Should it ever start, the targets worth having
are zh, de, fr, ja and es, on Obsidian's community demographics.

---

## Phase 8: Post-submission features

### 8.1 Library view

Full design: [Library](library.md). **Deferred**, with the reasons in that doc: series grouping, PDFs, and
note-body templates.

### 8.2 Annotation presets — user-defined marks and meanings

Full design: [Annotation Presets](annotation-presets.md).

- **Won't do:** a mark filter on the Saved pane — Advanced search already filters saved passage selections and notes
  by mark.
- **Deferred:** persistent in-book mark names and desktop hover tooltips — foliate's `Overlayer` returns no handle on
  the rects it draws, so both need a spike before being promised

### 8.4 Listening — read-aloud + recorded audio

See [Listening (TTS & Recording)](text-to-speech.md).

**Deferred:** high-tier (non-medium) desktop Piper voices with per-sentence worker-crash
recovery. Detailed history + backlog live in the doc.

- [x] **A button that turns on Pocket mode** — it took five steps, the last a command that existed only in Focus mode
      with the full player open. Now an open padlock at the top right of the full-screen player (phones and tablets;
      below the ✕ in Focus mode) locks in one tap, opening Focus mode if needed, and the command works from the
      listening bar or either player. Unlocking puts back what locking changed. Placed at the top rather than on the
      unlock rail: locking is done once and deliberately, and the top right has room on every phone.

### 8.5 Notes → EPUB

See [Markdown to EPUB](markdown-to-epub.md).

**Deferred deliberately:** subfolders (top-level `.md` only — one rule someone can hold in their
head), and a cover (`.orbis-cover-fallback` already draws title and author where art would go).

### 8.6 Shareable annotations (EPUB + user content)

**Won't do.** Generate notes and Save annotations as PDF already give someone else a book's annotations, as a note or
a PDF. Packaging them to load into another copy of Orbis would have needed a byte-identical edition on the other end,
and, to avoid that, shipping the book file itself.

### 8.13 Annotations and Conversions

- [x] **Save a PDF outside the vault** (2026-10-16) — Save as PDF and Save annotations as PDF have a second button at
      the left of the footer, apart from Cancel and Save: **Export…** on a computer opens the system save dialog, and
      **Share…** on a phone or tablet opens the share sheet. No setting: the button pressed is the choice. Measured
      first on the Mac, Android, iPhone and iPad with **Probe file sharing (dev)**. The desktop route is Electron's
      `dialog.showSaveDialog` and Node's `fs`; the mobile route is the vault adapter's `open(path)`, which Obsidian's
      own Share item calls, on a file in the plugin folder rather than the vault. `navigator.share` exists on iOS
      only, and there is no Capacitor share plugin. Neither route is in `obsidian.d.ts`, so a device without one shows
      no button. `Platform.isMacOS` is true on the iPhone and iPad, so the choice is made by `isDesktopApp`. See
      `src/outside-vault.ts`.
- [x] **Save as EPUB outside the vault** (2026-10-16) — **Save note as EPUB** and **Save folder as EPUB** have the
      same second button, from `outsideButton`. An EPUB already holds only links inside the book and web links, so
      nothing in it changes. Export asks where before the dialog closes; neither route asks about a book in the vault
      or writes a title note. **Save folder notes as EPUBs** writes a set and a contents note and stays in the vault;
      Read in Orbis Reader never asks.
- [x] **Save as Markdown outside the vault** (2026-10-16) — single note only; the button hides for **Book folder**.
      The note goes to `deliver` instead of the vault, and its links are written `portable` (`export-links.ts`): a
      link to a heading in the note is a standard Markdown link to a GitHub-style anchor (`githubSlug`), whatever
      **Link format** says; a later copy of a repeated heading, which only Obsidian's heading path reaches, and the
      block ids footnote back-links use are text. Images are left out, and `book` is the book's file name as text. No
      existing-file prompt.
- [x] **Generate notes outside the vault** (2026-10-16) — single note only; the button hides for **Book folder**.
      `buildNotesMarkdown(…, portable)` writes it for elsewhere (`reader/portable-markdown.ts`): a link into the book
      is its location as text, the **↗ Open in book** lines go, the properties stay with `book` as the file name in
      plain text, links to other notes in the reader's own text become their words, and the **Contents** links to the
      anchors GitHub gives the finished note, repeats numbered, so a chapter called Notes after a chapter's own Notes
      section still lands. No Merge / Save as new version / Replace, no replace warning, no notes-set record. With
      this, every single-file export has Export and Share.

### 8.14 Read in Orbis Reader

See [Read in Orbis Reader](read-in-orbis-reader.md).

**Deferred:** choosing an annotation preset per book made this way.

### 8.15 After 0.1.1

Found while testing `0.1.1-beta.1` (2026-11-19). Each waits until `0.1.1` ships.

- [ ] **Swipe to turn pages in a CBZ book.** foliate's fixed-layout renderer (`fixed-layout.js`), which shows CBZ books
      and fixed-layout EPUBs, has no touch handling: the paginator's swipe code (`paginator.js`) is its own. Turn the
      page on a horizontal swipe over the page, in the book's reading direction, so a right-to-left manga turns the way
      it reads. A swipe must not also be taken as the tap that opens the page in the image viewer. Then take out the
      guide's note that swiping does not turn a CBZ page (Getting Started, Reading a Book's *Turn pages*, and Format
      Support's table and *CBZ* section), and add a `mobile` CBZ swipe check to the Reading a Book test plan
- [ ] **A MOBI fixture with character references.** A Calibre-built MOBI or AZW3 whose title, author and a chapter
      name hold an `&` and accented letters, such as *Café & Co.*, so opening it goes through `unescapeHTML`'s decoding
      (foliate patch 32). None of the three MOBI and AZW3 fixtures has one. Add it to `test-vault/fixtures/README.md`
      and a check to a test plan
- [ ] **A page number on each sample CBZ page.** Pages 2 to 6 of `sample-comic.cbz` are the same image
      (`sampleComic` in `scripts/fixtures/books.ts`), so a page turn cannot be seen. Draw each page's number large in
      its middle, then `pnpm build:fixtures`
- [ ] **Two-column layout decides one page or two in a CBZ book.** foliate's fixed-layout renderer shows a two-page
      spread whenever the reading area is wider than it is tall (`fixed-layout.js`, `#render`), and the setting does
      not reach it: Orbis sets `max-column-count`, which only the paginator reads, and a CBZ file says nothing about
      spreads. With the setting on, keep today's spreads, which match what Display Settings says the setting does for
      text; with it off, show one page at any size. That needs an Orbis patch to `fixed-layout.js` for a single-page
      mode, set from `applyRenderer` for fixed-layout books. A fixed-layout EPUB follows it too, unless the book asks
      for spreads itself. Add a line on it to Format Support's *CBZ* section

---

## Backlog / ideas (unscheduled)

- **A book's name goes into one reading-records path twice, and Windows has a 260-character limit.** `recordPaths`
  in `book` mode builds `<folder>/<book>-reading-records/<book>.base`, so each character of a book's name costs two,
  and the content notes add `content/<record name>.md` on top of one copy of it. An 80-character name in a folder
  three deep, under a default Windows vault path, already passes `MAX_PATH` — a problem for a vault a Mac shares with
  a Windows machine, not for any one feature.

  **Check first** whether Obsidian on Windows hits `MAX_PATH` at all: Node prefixes `\\?\` for long paths in many
  operations, so this may already work. If it does not, stop repeating the book's name inside its own folder
  (`<book>-reading-records/records.base`), which halves the cost; that renames files in synced vaults, so it needs a
  version Orbis bumps and migrates. Generating shorter names would not fix it, since a book from an OPDS source with
  a long title has the same problem.

---

## Ongoing

**An undated "ongoing" item is indistinguishable from an undone one**, so each carries when it was last done.

- [ ] Review OSS / third-party attribution (licenses, `NOTICES`) when a runtime dependency changes — last done
      **2026-09-25**; the method is in [Dependency Security](dependency-security.md#runtime-dependencies)
- [ ] Performance profiling with large books (500+ pages, many highlights) — never done as a deliberate pass. Last
      finding **2026-10-08**: a large book's first open held the main thread for about a minute, all of it in the
      location index, which was quadratic twice over in a section's size — its CFIs (foliate patch 10) and its
      contents anchors (`anchorTextStarts`); from a DevTools profile, 3.9 MB section. The index is still built
      without yielding between sections, which matters only if a phone shows a stall
- [ ] Sync scan cost on Android — about **0.8 s** of background reading per return to the window, nearly all of it
      the record files (291 on **2026-10-10**, four devices), at about 3 ms a file even read in batches. Nothing waits
      on it, and it grows with devices × synced items, not with the vault. A cache that skips unchanged files would
      remove it, and was declined for now: it could miss another device's change if Obsidian's index lagged the disk.
      Revisit if the file count grows a lot
- [ ] Monitor foliate-js upstream and merge it into `src/vendor/foliate-js` — last merged through upstream
      `78914ae`, **2026-09**; see [Dependency Security](dependency-security.md)
- [ ] Quarterly dependency audit — last done **2026-09**, next due **2026-12**
- [ ] Recheck `onnxruntime-web` after 1.30 for iPadOS — **due 2026-12**. Every release since 1.19 asks for 4 GB of
      shared memory, which iPadOS won't reserve, so Piper can't start on the iPad; a version is ruled out without a
      device, and the steps are in
      [Dependency Security](dependency-security.md#held-at-1180-later-versions-fail-to-start-on-ipados).
- [ ] Remove the sidecar-name migration before 1.0 — `src/sidecar-migration.ts` and its `sidecarsNamedByFile` and `audioFoldersSuffixed` guards
      flag in `settings.ts`; see [Data migration](data-migration.md)
