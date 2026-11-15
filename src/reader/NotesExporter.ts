import { Notice, normalizePath, TFile, TFolder } from 'obsidian';
import { sanitizeName } from '../book-extractor';
import { resolveFrontmatterKey, t } from '../i18n';
import { filterNotesDataByMarks } from '../mark-filter';
import { splitLeaf } from '../panes';
import { type NotesFileChapter, type NotesFileSet, recordNotesFileSet } from '../progress';
import type { NoteStyle } from '../settings';
import { type FlatTocChapter, flattenTocWithDisambiguation, groupByTopLevel } from '../toc-utils';
import {
  type AnnotBucket,
  buildChapterFileContent,
  buildMocContent,
  buildNotesMarkdown,
  buildPerChapterAnnotBuckets,
  chapterFilesToWrite,
  type FlatTocEntry,
  makeNoteSetSlug,
  type NotesData,
  resolveChapterFilePlans,
} from './export-format';
import { earlierSetNotes } from './note-set-leftovers';
import type { ReaderContext } from './ReaderContext';

/**
 * Writes notes files to the vault (single-file and per-chapter modes) and tracks
 * the generated sets in the `.orbis` file. All markdown formatting is delegated
 * to the pure functions in `export-format.ts`; this class only does I/O and
 * orchestration. The modal-launching entry points (`generateCompanionNotes`,
 * `openOrCreateNotesFile`) stay on the view — they construct modals that need it.
 *
 * See `docs/design/reader-architecture.md`.
 */
/** `[[path|alias]]` or `[[path#heading]]` → `path`, as `getFirstLinkpathDest` takes it. */
function linkpathOf(link: string): string {
  return link.replace(/^\[\[|\]\]$/g, '').split(/[|#]/)[0];
}

/** Shared empty set, so the no-filter path allocates nothing on a run that has no filter. */
const EMPTY_MARKS: ReadonlySet<string> = new Set();

export class NotesExporter {
  constructor(private readonly ctx: ReaderContext) {}

  /**
   * The snapshot this run writes from, narrowed to the marks the reader chose.
   *
   * **One place, because everything downstream reads the same two arrays.** `buildNotesMarkdown` and
   * `buildPerChapterAnnotBuckets` both walk `highlights` and `notes`, so narrowing the snapshot once here needs no
   * change in either — see `filterNotesDataByMarks`, which returns the snapshot untouched when nothing is chosen,
   * so a run with no filter costs nothing and writes everything.
   *
   * Bookmarks pass through whatever is chosen: a bookmark carries no mark, so a mark filter has nothing to say
   * about it.
   */
  private snapshot(marks?: ReadonlySet<string>): NotesData {
    return filterNotesDataByMarks(this.ctx.notesData(), marks ?? EMPTY_MARKS);
  }

  async writeNotesFile(
    notesPath: string,
    config: NoteStyle['config'],
    insertAtBottom: boolean,
    openAfter = true,
    marks?: ReadonlySet<string>,
    /** The chapters this run covers, by contents href — absent follows the style's own rule. */
    chapters?: ReadonlySet<string>
  ): Promise<void> {
    const { app } = this.ctx;
    if (!this.ctx.currentFile) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }

    const existing = app.vault.getAbstractFileByPath(normalizePath(notesPath));
    let notesFile: TFile;

    if (existing instanceof TFile && insertAtBottom) {
      const md = buildNotesMarkdown(config, this.snapshot(marks), false, chapters);
      await app.vault.process(existing, (current) => current + '\n\n---\n\n' + md);
      notesFile = existing;
    } else if (existing instanceof TFile) {
      const md = buildNotesMarkdown(config, this.snapshot(marks), true, chapters);
      await app.vault.process(existing, () => md);
      notesFile = existing;
    } else {
      // Ensure folder exists
      const folderPath = notesPath.includes('/') ? notesPath.slice(0, notesPath.lastIndexOf('/')) : '/';
      if (folderPath !== '/' && !app.vault.getAbstractFileByPath(normalizePath(folderPath))) {
        await app.vault.createFolder(normalizePath(folderPath));
      }
      const md = buildNotesMarkdown(config, this.snapshot(marks), true, chapters);
      notesFile = await app.vault.create(normalizePath(notesPath), md);
    }

    this.ctx.invalidateBacklinks(this.ctx.currentFile.path);
    if (openAfter) {
      const leaf = splitLeaf(app);
      await leaf.openFile(notesFile);
    }
    new Notice(t('notices.notes_saved_basename', { basename: notesFile.basename }));
  }

  async generatePerChapterNotes(
    folderPath: string,
    config: NoteStyle['config'],
    styleId: string,
    styleName: string,
    noteSetSlugOverride?: string,
    openAfter = true,
    marks?: ReadonlySet<string>,
    chapters?: ReadonlySet<string>
  ): Promise<NotesFileSet | null> {
    const { app } = this.ctx;
    const file = this.ctx.currentFile;
    if (!file) {
      new Notice(t('notices.no_book_loaded'));
      return null;
    }
    const data = this.snapshot(marks);

    const flatToc: FlatTocEntry[] = flattenTocWithDisambiguation(data.tocItems).map((e, i) => ({
      ...e,
      tocIndex: i,
    }));

    const annotByChapter = buildPerChapterAnnotBuckets(config, data);

    /**
     * **One file per CHAPTER, with its subheadings as headings inside it.**
     *
     * A file per contents entry at any depth would give a book converted from a folder of notes a file per
     * heading, and the document itself would be nowhere. `groupByTopLevel` folds the
     * contents into chapters and the sections beneath them; `tocIndex` comes back off the flat list, since the file
     * plan spaces `sectionIndex` across the book by it.
     */
    const tocIndexOf = new Map(flatToc.map((e) => [e.href, e.tocIndex]));
    const marksIn = (bk: AnnotBucket | undefined): number =>
      bk ? bk.bookmarks.length + bk.highlights.length + bk.notes.length : 0;
    const bucketFor = (entry: FlatTocChapter): AnnotBucket | undefined =>
      annotByChapter.get(entry.href || entry.label || '');
    const allGroups = groupByTopLevel(flatToc, data.tocItems);

    /**
     * **A hand-made selection outranks the rule**, which is what makes it a selection: `chapterFilesScope` is the
     * style's standing answer, and ticking boxes is this run departing from it. The same order the PDF's dialog
     * follows, where choosing a row sets the scope to `custom` and the rule stops claiming what it no longer decides.
     *
     * The selection holds hrefs at every depth — a picked chapter carries its subtree — so a chapter is picked when
     * its own href is in the set, and content is counted across the whole chapter rather than on its head alone.
     */
    const groupsToGenerate = chapterFilesToWrite(
      allGroups,
      config,
      chapters,
      (group) => marksIn(bucketFor(group.chapter)) + group.sections.reduce((n, s) => n + marksIn(bucketFor(s)), 0)
    );

    if (groupsToGenerate.length === 0) {
      new Notice(t('notices.no_chapters_to_generate_no_content_found'));
      return null;
    }

    const chaptersToGenerate: FlatTocEntry[] = groupsToGenerate.map((group) => ({
      ...group.chapter,
      tocIndex: tocIndexOf.get(group.chapter.href) ?? 0,
    }));

    const chapterPlans = resolveChapterFilePlans(
      chaptersToGenerate,
      flatToc.length,
      folderPath,
      config,
      styleName,
      data
    );

    const slugify = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const noteSetSlug = noteSetSlugOverride ?? (slugify(folderPath) || makeNoteSetSlug(file.basename, styleId));

    // This set's notes from an earlier run, read before anything is written — see `earlierSetNotes`. The folder's
    // own notes only, by what their properties say; nothing else in it is touched.
    const existingFolderAbstract = app.vault.getAbstractFileByPath(normalizePath(folderPath));
    const earlier =
      existingFolderAbstract instanceof TFolder
        ? earlierSetNotes(
            existingFolderAbstract.children
              .filter((child): child is TFile => child instanceof TFile && child.extension === 'md')
              .map((note) => ({ path: note.path, frontmatter: app.metadataCache.getFileCache(note)?.frontmatter })),
            noteSetSlug,
            (link, from) => app.metadataCache.getFirstLinkpathDest(linkpathOf(link), from) === file,
            (k) => resolveFrontmatterKey(k, data.frontmatterKeyLanguage)
          )
        : [];
    if (!existingFolderAbstract) await app.vault.createFolder(normalizePath(folderPath));
    const generatedChapters: NotesFileChapter[] = [];

    for (let i = 0; i < chapterPlans.length; i++) {
      const plan = chapterPlans[i];
      const prevPath = i > 0 ? chapterPlans[i - 1].filePath : null;
      const nextPath = i < chapterPlans.length - 1 ? chapterPlans[i + 1].filePath : null;
      const content = buildChapterFileContent(
        plan,
        i + 1,
        prevPath,
        nextPath,
        annotByChapter.get(plan.href || plan.label || ''),
        config,
        noteSetSlug,
        data,
        groupsToGenerate[i].sections.map((entry) => ({ entry, bucket: bucketFor(entry) }))
      );
      const existing = app.vault.getAbstractFileByPath(normalizePath(plan.filePath));
      if (existing instanceof TFile) {
        await app.vault.process(existing, () => content);
      } else {
        await app.vault.create(normalizePath(plan.filePath), content);
      }
      generatedChapters.push({
        chapter: i + 1,
        title: plan.displayLabel,
        href: plan.href,
        sectionIndex: plan.sectionIndex,
        path: plan.filePath,
      });
    }

    const mocFileName = '000 - ' + sanitizeName(data.meta.title || file.basename);
    const mocPath = `${folderPath}/${mocFileName}.md`;
    const mocContent = buildMocContent({
      bookTitle: data.meta.title || file.basename,
      bookLinkPath: file.path,
      author: data.meta.author,
      styleName,
      noteSetSlug,
    });
    const existingMoc = app.vault.getAbstractFileByPath(normalizePath(mocPath));
    if (existingMoc instanceof TFile) {
      await app.vault.process(existingMoc, () => mocContent);
    } else {
      await app.vault.create(normalizePath(mocPath), mocContent);
    }

    const writtenPaths = new Set([...chapterPlans.map((p) => p.filePath), mocPath]);
    let removed = 0;
    for (const stalePath of earlier) {
      if (!writtenPaths.has(stalePath)) {
        const staleFile = app.vault.getAbstractFileByPath(normalizePath(stalePath));
        if (staleFile instanceof TFile) {
          await app.fileManager.trashFile(staleFile);
          removed++;
        }
      }
    }

    this.ctx.invalidateBacklinks(file.path);
    const mocFileAbstract = app.vault.getAbstractFileByPath(normalizePath(mocPath));
    const mocFile = mocFileAbstract instanceof TFile ? mocFileAbstract : null;
    if (mocFile && openAfter) {
      const leaf = splitLeaf(app);
      await leaf.openFile(mocFile);
    }
    // What the folder now holds, and — after a Replace that took notes away — how many went, so a run that removed
    // nothing says so by saying nothing. "Removed", not "trash": Obsidian's Deleted files setting decides where.
    const n = generatedChapters.length;
    const wrote = t(
      n === 1 ? 'notices.wrote_n_chapter_notes_and_contents_one' : 'notices.wrote_n_chapter_notes_and_contents',
      { n }
    );
    if (!removed) new Notice(wrote);
    else
      new Notice(
        `${wrote} ${t(removed === 1 ? 'notices.removed_n_earlier_chapter_notes_one' : 'notices.removed_n_earlier_chapter_notes', { n: removed })}`
      );

    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      styleName,
      styleId,
      createdAt: Date.now(),
      mode: 'per-chapter',
      folder: folderPath,
      mocPath,
      noteSetSlug,
      chapters: generatedChapters,
    };
  }

  async recordNotesFileSet(set: NotesFileSet): Promise<void> {
    if (!this.ctx.currentFile) return;
    await recordNotesFileSet(this.ctx.app, this.ctx.currentFile, set);
  }

  isSetLive(set: NotesFileSet): boolean {
    if (set.mode === 'per-chapter') {
      return !!this.ctx.app.vault.getAbstractFileByPath(normalizePath(set.folder ?? ''));
    }
    return this.ctx.app.vault.getAbstractFileByPath(normalizePath(set.path ?? '')) instanceof TFile;
  }
}
