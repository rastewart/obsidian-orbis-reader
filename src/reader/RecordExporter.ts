import { Notice, normalizePath, TFile } from 'obsidian';
import { isBookExtension } from '../book-formats';
import { t } from '../i18n';
import { linkTarget, toText } from '../library/record';
import { resolveRecordFile } from '../library/resolve';
import { titleNoteFor } from '../library/title-note';
import type { RecordLocation } from '../record-config';
import { flattenTocWithDisambiguation } from '../toc-utils';
import {
  bookmarkRecord,
  derivedBody,
  highlightRecord,
  LEGACY_RECORD_TAGS,
  mergeRecordBody,
  newRecordBody,
  noteRecord,
  RECORD_TAG,
  type RecordBookContext,
  type RecordKeepReason,
  type RecordKind,
  type RecordProperties,
  recordFileName,
  recordKeepReason,
} from './annotation-records';
import type { NotesData } from './export-format';
import type { ReaderContext } from './ReaderContext';
import { recordBookName, recordStem } from './record-book-name';
import { moveRecordFiles } from './record-move';
import { type RecordPaths, recordPaths } from './record-paths';
import { bookRecordsBaseYaml, recordsBaseYaml } from './records-base';

/** What one export pass changed. */
export interface ExportCounts {
  created: number;
  updated: number;
  orphaned: number;
}

/** Where one book's records go: its resolved location, plus the shared root the every-book base lives in. */
export interface RecordTarget {
  location: RecordLocation;
  /** `recordsFolder` from settings. Only a `global` location needs it to be set. */
  globalRoot: string;
  /** Where the base covering every book goes; null when the reader has declined it. `allBooksBaseRoot()`. */
  allBooksRoot: string | null;
}

/**
 * Writes one vault note per saved annotation, plus a `.base` of starting views.
 *
 * The I/O half of `annotation-records.ts`, which owns all the shaping. Separate from `NotesExporter` on
 * purpose: that one produces documents you read and has a whole merge apparatus behind it, because
 * regenerating a 500-line file the reader may have edited is genuinely hard. This one produces records you
 * query, and regeneration is per-file and idempotent — which is most of why the shape was chosen.
 *
 * See docs/design/reading-records.md.
 */
export class RecordExporter {
  constructor(private readonly ctx: ReaderContext) {}

  /**
   * Where one book's records and its own base go — both layouts live in `record-paths.ts`, which documents
   * them and is where the path arithmetic is tested.
   *
   * **The root folder is the feature's interface**: bases are what you open, `content/` is data you never
   * browse. That is what makes a base per book an entry point rather than clutter — nesting each one inside its
   * own content folder would be tidier and useless.
   *
   * All this adds is the book's *name*, which is the one part that cannot be pure: in a root layout it comes
   * from `recordBookName`, since two `sample.epub` in different vault folders would otherwise share one folder
   * and one base — and that has to know about every OTHER book, which is the only reason this class reaches
   * into the vault beyond writing.
   */
  private layout(target: RecordTarget, bookPath: string): RecordPaths {
    // Both layouts need the other books: a root layout to tell same-named books in different folders apart, and a
    // book-local one to tell formats of one book apart — `sample.epub` beside `sample.azw3` — since each format
    // keeps its own records (see `recordStem`).
    const all = this.allBookPaths();
    return recordPaths({
      location: target.location,
      bookPath,
      bookName: target.location.mode === 'book' ? '' : recordBookName(bookPath, all),
      bookStem: recordStem(bookPath, all),
      globalRoot: target.globalRoot,
      allBooksRoot: target.allBooksRoot,
    });
  }

  /** Every book in the vault, for disambiguating one book's name against the rest. Cheap enough per export;
   *  live export will want this cached for the session rather than recomputed per annotation. */
  private allBookPaths(): string[] {
    return this.ctx.app.vault
      .getFiles()
      .filter((f) => isBookExtension(f.extension))
      .map((f) => f.path);
  }

  /** Returns what changed, so a caller can tell a pass that actually wrote something from one that found
   *  everything already current — which is what decides whether a book gets its decision stamped. */
  async exportBook(target: RecordTarget, opts?: { silent?: boolean }): Promise<ExportCounts | null> {
    const { app } = this.ctx;
    const file = this.ctx.currentFile;
    if (!file) {
      if (!opts?.silent) new Notice(t('notices.no_book_loaded'));
      return null;
    }
    const data = this.ctx.notesData();
    const paths = this.layout(target, data.filePath);
    const folder = paths.records;
    await this.ensureFolder(folder);
    // Before the records, because each one carries a link to it — a cards view binds `image:` to a property, so
    // the path has to be known while the properties are built.
    const coverPath = this.libraryCover(data.filePath);

    const book: RecordBookContext = {
      filePath: data.filePath,
      title: data.meta.title || data.fileBasename,
      author: data.meta.author,
      marks: data.marks,
      coverPath: coverPath ?? undefined,
      // Reading order, keyed by the href — the same identity the prose exporter groups on, because chapter
      // LABELS repeat across parts ("PART I > CHAPTER I", "PART II > CHAPTER I").
      chapterIndex: new Map(flattenTocWithDisambiguation(data.tocItems ?? []).map((e, i) => [e.href, i + 1])),
    };

    // Selections are passed alongside the properties rather than living in them: a highlight's passage is its
    // body, and only a note carries both a passage and its own text.
    const kinds = this.ctx.recordKinds;
    const jobs: { props: RecordProperties; kind: RecordKind; excerpt: string; selection?: string }[] = [
      ...(kinds.passages ? data.highlights : []).map((h) => ({
        props: highlightRecord(h, book),
        kind: 'passage selection' as const,
        excerpt: h.text,
        selection: h.text,
      })),
      ...(kinds.notes ? data.notes : []).map((n) => ({
        props: noteRecord(n, book),
        kind: 'note' as const,
        // The passage names the file when there is one; a standalone note has only its own words to offer.
        excerpt: n.selectedText || n.text,
        selection: n.selectedText,
      })),
      ...(kinds.bookmarks ? data.bookmarks : []).map((b) => ({
        props: bookmarkRecord(b, book),
        kind: 'bookmark' as const,
        excerpt: b.chapter ?? '',
      })),
    ];

    let created = 0;
    let updated = 0;
    for (const job of jobs) {
      const path = normalizePath(`${folder}/${recordFileName(job.kind, job.excerpt, job.props.orbis_id)}.md`);
      const derived = derivedBody(job.props, job.selection);
      const existing = app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        if (await this.updateRecord(existing, job.props, derived)) updated++;
      } else {
        await app.vault.create(path, newRecordBody(derived));
        const made = app.vault.getAbstractFileByPath(path);
        if (made instanceof TFile) await this.writeProps(made, job.props);
        created++;
      }
    }

    const orphaned = await this.markOrphans(folder, data);
    // Skipped when no shared folder has been named — a book keeping its records beside itself has nowhere to
    // put an every-book base, and does not need one: the per-book base is the entry point there.
    if (paths.globalBase) {
      await this.migrateBaseTag(paths.globalBase);
      await this.writeIfAbsent(paths.globalBase, recordsBaseYaml());
    }
    await this.migrateBaseTag(paths.bookBase);
    await this.writeIfAbsent(paths.bookBase, bookRecordsBaseYaml(folder));
    // Silent for the live path: this fires while the reader is reading, and a toast per highlight is worse than
    // no feature. A run that changed nothing says nothing either way.
    if (!opts?.silent) {
      new Notice(t('notices.records_exported', { created: String(created), updated: String(updated) }));
    }
    if (created || updated || orphaned || !opts?.silent) {
      this.ctx.debug(`records: ${created} created, ${updated} updated, ${orphaned} orphaned in ${folder}`, 'export');
    }
    return { created, updated, orphaned };
  }

  /** Every record note in one book's folder. */
  private recordsIn(folder: string): TFile[] {
    const prefix = `${folder}/`;
    return this.ctx.app.vault.getFiles().filter((f) => f.extension === 'md' && f.path.startsWith(prefix));
  }

  private orbisIdOf(file: TFile): string | undefined {
    const fm = this.ctx.app.metadataCache.getFileCache(file)?.frontmatter;
    const id: unknown = fm?.orbis_id;
    return typeof id === 'string' ? id : undefined;
  }

  /**
   * Flag records whose annotation is no longer in the book, and unflag any that came back.
   *
   * **Never trashes the file**: the body below the marker may be the reader's own writing, and silently deleting a
   * file someone has written in is the one unrecoverable failure available here. Removal is the cleanup action's
   * job, and only ever for records with nothing of theirs in them.
   *
   * Expected ids come from **all** of the book's saved content, not from the enabled kinds. Otherwise switching
   * bookmarks off would mark every bookmark record as though its bookmark had been deleted — which is a different
   * fact, and a destructive one to get wrong. Records of a kind you have switched off simply stop being updated.
   *
   * Unflagging matters because a record can be orphaned by accident: a book opened while its `.orbis` file has not
   * synced yet has no annotations to expect, so everything looks gone. The next pass with the real data puts it
   * back rather than leaving a permanent scar.
   */
  private async markOrphans(folder: string, data: NotesData): Promise<number> {
    const expected = new Set<string>([
      ...data.highlights.map((h) => h.id),
      ...data.notes.map((n) => n.id),
      ...data.bookmarks.map((b) => b.id),
    ]);
    let changed = 0;
    for (const file of this.recordsIn(folder)) {
      const id = this.orbisIdOf(file);
      if (!id) continue; // not one of ours, or not indexed yet — leave it alone
      const shouldBeOrphaned = !expected.has(id);
      const fm = this.ctx.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.orphaned === shouldBeOrphaned) continue;
      await this.ctx.app.fileManager.processFrontMatter(file, (front: Record<string, unknown>) => {
        front.orphaned = shouldBeOrphaned;
      });
      changed++;
    }
    return changed;
  }

  /**
   * Remove the records of deleted annotations — but only those the reader has not written in.
   *
   * The confirmation names both groups because a blanket "are you sure" over a mixed set trains you to click
   * through it, which is exactly when the one file you had written in goes. Records with your own writing below the
   * marker are **listed and kept**: there is no button here that deletes your prose, because that is the only
   * unrecoverable thing in this feature. Deleting one by hand in the file explorer is always available.
   */
  async collectOrphans(target: RecordTarget): Promise<{ removable: TFile[]; yours: TFile[] } | null> {
    const data = this.ctx.notesData();
    if (!this.ctx.currentFile) return null;
    const folder = this.layout(target, data.filePath).records;
    const removable: TFile[] = [];
    const yours: TFile[] = [];
    for (const file of this.recordsIn(folder)) {
      if (this.ctx.app.metadataCache.getFileCache(file)?.frontmatter?.orphaned !== true) continue;
      ((await this.keepReason(file)) ? yours : removable).push(file);
    }
    return { removable, yours };
  }

  /**
   * An annotation was just deleted in the reader: remove its record, or flag it if the reader has anything
   * invested in it.
   *
   * **Driven by the deletion, not inferred from a comparison.** `markOrphans` decides what is gone by diffing the
   * folder against what is in memory, and that set is empty for a book whose `.orbis` has not synced yet — every
   * record in the book would look deleted. Flagging survives that (the next pass unflags); removing files would
   * not. This path only ever runs because someone pressed delete in this session, so there is no inference to be
   * wrong about. Deletions discovered any other way still only get the flag.
   *
   * Trash, not delete, so Obsidian's own recovery applies — noting that a vault set to "permanently delete" has
   * none. Silent either way: the reader initiated it, and a toast per highlight is the noise the live export
   * exists to avoid.
   */
  async recordsDeleted(target: RecordTarget, ids: readonly string[]): Promise<{ removed: number; kept: number }> {
    const file = this.ctx.currentFile;
    if (!file || !ids.length) return { removed: 0, kept: 0 };
    const folder = this.layout(target, file.path).records;
    // One pass over the folder for the whole batch — a bulk delete would otherwise re-filter the vault per id.
    const byId = new Map<string, TFile>();
    for (const record of this.recordsIn(folder)) {
      const id = this.orbisIdOf(record);
      if (id) byId.set(id, record);
    }
    let removed = 0;
    let kept = 0;
    for (const id of ids) {
      const record = byId.get(id);
      if (!record) continue; // never written, a kind that is switched off, or already gone
      const keep = await this.keepReason(record);
      if (keep) {
        await this.ctx.app.fileManager.processFrontMatter(record, (fm: Record<string, unknown>) => {
          fm.orphaned = true;
        });
        kept++;
        this.ctx.debug(`records: kept ${record.path} (${keep}) and flagged it orphaned`, 'export');
      } else {
        await this.ctx.app.fileManager.trashFile(record).catch((e) => {
          this.ctx.debug(`records: could not remove ${record.path} — ${String(e)}`, 'export');
        });
        removed++;
        this.ctx.debug(`records: removed ${record.path} — its annotation was deleted`, 'export');
      }
    }
    return { removed, kept };
  }

  /** The veto, in the one place both the live delete and the cleanup action read it from. Null = nothing of the
   *  reader's in this record, so it can go. */
  private async keepReason(file: TFile): Promise<RecordKeepReason | null> {
    return recordKeepReason({
      body: await this.ctx.app.vault.read(file),
      frontmatter: this.ctx.app.metadataCache.getFileCache(file)?.frontmatter,
      resolvedLinks: this.ctx.app.metadataCache.resolvedLinks,
      path: file.path,
    });
  }

  /** What is at a location now: the folder, and how many records are in it. For the dialog's preview line
   *  and its move warning — and cheap, since `recordsIn` is a path-prefix filter over the file list. */
  preview(target: RecordTarget): { folder: string; count: number } {
    const file = this.ctx.currentFile;
    if (!file) return { folder: '', count: 0 };
    const folder = this.layout(target, file.path).records;
    return { folder, count: this.recordsIn(folder).length };
  }

  /** Move this book's records between two locations — the layout resolution here, the file work in
   *  `record-move.ts`, which the book-rename handler shares. Callers export afterwards, never before: see
   *  that module's own note on why the order is the whole point. */
  async moveRecords(from: RecordTarget, to: RecordTarget): Promise<number> {
    const file = this.ctx.currentFile;
    if (!file) return 0;
    return moveRecordFiles(
      { app: this.ctx.app, log: (m) => this.ctx.debug(m, 'export') },
      this.layout(from, file.path),
      this.layout(to, file.path)
    );
  }

  /** Trash rather than hard-delete, so Obsidian's own recovery still applies to a mistake here. */
  async removeOrphans(files: readonly TFile[]): Promise<number> {
    let removed = 0;
    for (const file of files) {
      await this.ctx.app.fileManager.trashFile(file).catch((e) => {
        this.ctx.debug(`records: could not remove ${file.path} — ${String(e)}`, 'export');
      });
      removed++;
    }
    return removed;
  }

  /**
   * The derived region when the marker is still there and something changed; the frontmatter always.
   *
   * `processFrontMatter` is Obsidian's own read-modify-write for properties, so it cannot disturb the body —
   * which is the contract this design rests on: properties are ours and kept current, the body below the
   * marker is the reader's from the moment the file exists.
   *
   * **The body write goes first, and `processFrontMatter` last.** The other order has a whole-file `modify` land
   * after a queued property write, so anything read before that write completed is written back over it — the
   * properties would then be a pass behind until the next change. This way the frontmatter-safe API is the last
   * thing to touch the file, and it merges into whatever the body write left.
   */
  private async updateRecord(file: TFile, props: RecordProperties, derived: string): Promise<boolean> {
    // Nothing to do, and nothing read from disk to find that out — which is what makes the live path free to run
    // on every settle. Without it a debounced write would rewrite every record's frontmatter on every highlight,
    // touching hundreds of mtimes and syncing all of them, for no change.
    if (this.frontmatterMatches(file, props)) return false;
    const next = mergeRecordBody(await this.ctx.app.vault.read(file), derived);
    // A body already right, or a marker the reader deleted — the properties are still updated either way. Deleting
    // the marker opts out of the derived region, not out of being a record.
    if (next !== null) await this.ctx.app.vault.modify(file, next);
    await this.writeProps(file, props);
    return true;
  }

  /**
   * Whether the file's frontmatter already says exactly this, read from the metadata CACHE — no file I/O.
   *
   * The body is not checked, and does not need to be: it is built from the passage and the note text, both of
   * which are mirrored into properties, so frontmatter agreeing implies the derived body agrees. The one gap is a
   * passage edited beyond the 200-character `excerpt` cap, and passages are not edited — they are created.
   *
   * A file with no cached frontmatter yet counts as different, so a record just created still gets its properties.
   */
  private frontmatterMatches(file: TFile, props: RecordProperties): boolean {
    const fm: Record<string, unknown> | undefined = this.ctx.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) return false;
    return Object.entries(props).every(([key, want]) => {
      const have: unknown = fm[key];
      if (Array.isArray(want))
        return Array.isArray(have) && have.length === want.length && have.every((v, i) => v === want[i]);
      // `note_text` is absent on a passage selection or bookmark, where undefined and a missing key are the same.
      return want === undefined ? have === undefined : have === want;
    });
  }

  private async writeProps(file: TFile, props: RecordProperties): Promise<void> {
    await this.ctx.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(props)) {
        // `note_text` is absent on a highlight or bookmark; writing undefined would leave an empty key.
        if (v === undefined) delete fm[k];
        else fm[k] = v;
      }
    });
  }

  /**
   * A generated file, written once and **never overwritten** — the reader owns it from the moment it lands, and
   * re-running an export must not discard the columns or filters they chose. The escape hatch is a deliberate
   * "recreate default bases" command, not a silent rewrite.
   *
   * The YAML itself lives in `records-base.ts`, where its many undocumented Bases facts can be tested.
   */
  /** Bases already checked this session, so a settled export does not re-read two files every four seconds
   *  for a migration that has already happened. */
  private readonly baseTagChecked = new Set<string>();

  /**
   * Point an existing base at the current record tag.
   *
   * A base embeds the tag as a literal in its filter and is written with `writeIfAbsent`, so a renamed tag would
   * leave it matching nothing — silently, since an empty view looks like a book with no records. Rewriting the
   * filter text is deliberately gentler than deleting and regenerating: it keeps any views the reader added by
   * hand, and it is idempotent, since afterwards there is no legacy tag left to match.
   *
   * Scoped to the two paths this class computes. Nothing else in the vault is touched.
   */
  private async migrateBaseTag(path: string): Promise<void> {
    if (this.baseTagChecked.has(path)) return;
    this.baseTagChecked.add(path);
    const file = this.ctx.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return; // absent → writeIfAbsent is about to create it, already current
    try {
      const text = await this.ctx.app.vault.read(file);
      let next = text;
      for (const legacy of LEGACY_RECORD_TAGS) next = next.split(legacy).join(RECORD_TAG);
      if (next === text) return;
      await this.ctx.app.vault.modify(file, next);
      this.ctx.debug(`records: base filter retagged in ${path}`, 'export');
    } catch (e) {
      // A base that cannot be migrated shows nothing, which is visible and fixable by deleting it. Failing the
      // whole export over it would be worse.
      this.ctx.debug(`records: could not retag ${path} — ${String(e)}`, 'export');
    }
  }

  private async writeIfAbsent(path: string, contents: string): Promise<void> {
    if (this.ctx.app.vault.getAbstractFileByPath(path)) return;
    await this.ensureFolder(path.slice(0, path.lastIndexOf('/')));
    await this.ctx.app.vault.create(path, contents);
  }

  /**
   * The book's cover, taken from its title note rather than written here.
   *
   * **Records do not extract their own copy**, which would be a second answer to a question the library already
   * answers: a title note points at an image in the vault, and reading records should show the same one rather
   * than keep a duplicate under a different name. Two copies of one JPEG per book is the kind of thing
   * nobody notices until they wonder which is which.
   *
   * Null when the library is off, when nothing describes this book, or when that note has no cover — all of which
   * mean the same thing here: no image to point at, and a record without one is a record without a picture.
   */
  private libraryCover(bookPath: string): string | null {
    if (!this.ctx.libraryEnabled) return null;
    const note = titleNoteFor(this.ctx.app, bookPath);
    if (!note) return null;
    const cover = toText(this.ctx.app.metadataCache.getFileCache(note)?.frontmatter?.cover);
    if (!cover) return null;
    // Through the record's own link rules, so a cover written as a short link resolves the way the Library resolves
    // it — a record pointing at a path that only Obsidian can find would show a broken image in a Bases card.
    return resolveRecordFile(this.ctx.app, linkTarget(cover), note.path)?.path ?? null;
  }

  private async ensureFolder(path: string): Promise<void> {
    if (this.ctx.app.vault.getAbstractFileByPath(path)) return;
    await this.ctx.app.vault.createFolder(path).catch(() => {
      /* a concurrent create is fine — the folder existing is all this needs */
    });
  }
}
